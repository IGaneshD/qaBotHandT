from typing import TypedDict, Any, List, Optional
import os

from dotenv import load_dotenv
from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain_groq import ChatGroq
from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage


from ..rag.vectorstore import get_retriever


load_dotenv()


class GraphState(TypedDict):
    question: str
    answer: str
    collection_id: Optional[str]
    messages: List[BaseMessage]


def _get_llm(provider: str = "gemini", model: str = "gemini-2.0-flash"):
    """Get LLM instance - currently using Google Gemini."""
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=0,
    )
    
    
    
    # """Get LLM instance with specified provider and model."""
    # if provider == "gemini":
    #     return ChatGoogleGenerativeAI(
    #         model=model,
    #         temperature=0,
    #     )
    # elif provider == "openai":
    #     return ChatOpenAI(
    #         model=model,
    #         temperature=0,
    #         api_key=os.getenv("OPENAI_API_KEY"),
    #     )
    # elif provider == "azure_openai":
    #     return AzureChatOpenAI(
    #         azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", model),
    #         temperature=0,
    #         azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    #         api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    #         api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
    #     )
    # elif provider == "groq":
    #     return ChatGroq(
    #         model=model,
    #         temperature=0,
    #         api_key=os.getenv("GROQ_API_KEY"),
    #     )
    # else:
    #     raise ValueError(f"Unsupported provider: {provider}")


def _create_retrieve_tool(collection_id: Optional[str] = None):
    """Create a retrieval tool for a specific collection."""
    retriever = get_retriever(collection_id)
    
    @tool
    def retrieve_context(question: str) -> str:
        """Retrieve relevant context from the vector store for a question."""
        docs = retriever.invoke(question)
        if not docs:
            return "No relevant context found in the vector store."
        return "\n\n".join(d.page_content for d in docs)
    
    return retrieve_context


# System prompt string for the agent
_system_prompt = (
    "You are a helpful document Q&A assistant. You MUST use the retrieve_context tool "
    "to search the uploaded documents before answering ANY question. "
    "ALWAYS call retrieve_context first with the user's question to get relevant content. "
    "Base your answers ONLY on the retrieved document content. "
    "If the retrieval returns no relevant content, say so clearly.\n\n"
    "IMPORTANT: You MUST format ALL your responses using proper Markdown syntax:\n"
    "- Use # for main headings and ## for subheadings\n"
    "- Use **bold** for key terms and important points\n"
    "- Use *italics* for emphasis\n"
    "- Use - or * for bullet point lists\n"
    "- Use 1. 2. 3. for numbered/ordered lists\n"
    "- Use > for blockquotes when citing document content\n"
    "- Use `code` for inline code and ```language``` for code blocks\n"
    "- Use --- for horizontal rules to separate sections\n"
    "- Use tables with | when presenting structured data\n\n"
    "Structure your answers with clear headings and organized sections. "
    "Make responses visually appealing and easy to scan."
)


def _extract_answer(result: Any) -> str:
    """Extract the final answer string from a create_agent result."""
    if isinstance(result, dict):
        messages: List[Any] = result.get("messages") or []
        if messages:
            last = messages[-1]
            content = getattr(last, "content", str(last))
            
            # Handle list of content blocks (newer LangChain format)
            if isinstance(content, list):
                text_parts = []
                for block in content:
                    if isinstance(block, dict):
                        text_parts.append(block.get("text", ""))
                    else:
                        text_parts.append(str(block))
                return "".join(text_parts)
            
            return str(content)
        return str(result)
    return getattr(result, "content", str(result))


def _answer_node(state: GraphState, provider: str = "gemini", model: str = "gemini-2.0-flash") -> GraphState:
    question = state["question"]
    collection_id = state.get("collection_id")
    previous_messages = state.get("messages", [])
    
    # Create retrieval tool for the specific collection
    retrieve_tool = _create_retrieve_tool(collection_id)
    tools = [retrieve_tool]
    
    # Create agent with collection-specific tools and specified model
    llm = _get_llm(provider, model)
    agent = create_agent(model=llm, tools=tools, system_prompt=_system_prompt)
    
    # Build messages list with previous conversation history
    all_messages = list(previous_messages) + [HumanMessage(content=question)]
    
    result = agent.invoke({"messages": all_messages})
    answer = _extract_answer(result)
    
    # Update messages with the new user message and assistant response
    updated_messages = all_messages + [AIMessage(content=answer)]
    
    return {
        "question": question,
        "answer": answer,
        "collection_id": collection_id,
        "messages": updated_messages
    }


async def arun_graph(question: str, collection_id: str, provider: str = "gemini", model: str = "gemini-2.0-flash") -> dict:
    """
    Async version: Run the graph with the given question and collection_id.
    Uses collection_id as both the retrieval collection and thread_id for checkpointing.
    """
    # Use AsyncSqliteSaver as a context manager for proper async handling
    async with AsyncSqliteSaver.from_conn_string("langgraph_state.db") as checkpointer:
        # Create a graph that uses the specified model
        graph = StateGraph(GraphState)
        graph.add_node("answer", lambda state: _answer_node(state, provider, model))
        graph.set_entry_point("answer")
        graph.set_finish_point("answer")
        
        compiled_app = graph.compile(checkpointer=checkpointer)
        
        # Get current state to retrieve message history
        config = {"configurable": {"thread_id": collection_id}}
        current_state = await compiled_app.aget_state(config)
        
        # Extract existing messages from the checkpoint
        existing_messages = []
        if current_state and hasattr(current_state, 'values') and current_state.values:
            existing_messages = current_state.values.get("messages", [])
        
        result = await compiled_app.ainvoke(
            {"question": question, "collection_id": collection_id, "messages": existing_messages},
            config=config,
        )
    return {"answer": result["answer"], "thread_id": collection_id}


async def arun_graph_stream(question: str, collection_id: str, provider: str = "gemini", model: str = "gemini-2.0-flash"):
    """
    Stream the answer token by token.
    """
    try:
        async with AsyncSqliteSaver.from_conn_string("langgraph_state.db") as checkpointer:
            # Create retrieval tool for the specific collection
            retrieve_tool = _create_retrieve_tool(collection_id)
            tools = [retrieve_tool]
            
            # Create agent with collection-specific tools and specified model
            llm = _get_llm(provider, model)
            agent = create_agent(model=llm, tools=tools, system_prompt=_system_prompt)
            
            # Stream the response
            async for chunk in agent.astream({"messages": [HumanMessage(content=question)]}):
                # Extract content from the chunk
                if "messages" in chunk:
                    messages = chunk["messages"]
                    if messages:
                        last_message = messages[-1]
                        if hasattr(last_message, "content"):
                            content = last_message.content
                            if isinstance(content, str) and content:
                                yield content
                            elif isinstance(content, list):
                                for block in content:
                                    if isinstance(block, dict) and "text" in block:
                                        yield block["text"]
    except Exception as e:
        print(f"Error in streaming: {e}")
        import traceback
        traceback.print_exc()
        yield f"Error: {str(e)}"


async def get_chat_history(collection_id: str) -> List[dict]:
    """
    Retrieve chat history for a given collection_id/thread_id.
    Returns a list of messages in the format: [{"role": "user|assistant", "content": "..."}]
    """
    try:
        async with AsyncSqliteSaver.from_conn_string("langgraph_state.db") as checkpointer:
            # Get the state history for this thread
            config = {"configurable": {"thread_id": collection_id}}
            
            # Get the most recent state
            current_state = await checkpointer.aget(config)
            
            if current_state and hasattr(current_state, 'checkpoint') and current_state.checkpoint:
                # Extract messages from checkpoint
                checkpoint_data = current_state.checkpoint.get('channel_values', {})
                messages_list = checkpoint_data.get('messages', [])
                
                # Convert LangChain messages to simple dict format
                messages = []
                for msg in messages_list:
                    if isinstance(msg, HumanMessage):
                        messages.append({
                            "role": "user",
                            "content": msg.content
                        })
                    elif isinstance(msg, AIMessage):
                        messages.append({
                            "role": "assistant",
                            "content": msg.content
                        })
                
                return messages
            
            return []
    except Exception as e:
        print(f"Error retrieving chat history: {e}")
        import traceback
        traceback.print_exc()
        return []
