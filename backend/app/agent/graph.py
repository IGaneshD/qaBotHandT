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


def _get_llm(provider: str = "azure_openai", model: str = "gpt-4o"):
    """Get LLM instance with specified provider and model."""
    if provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model,
            temperature=0,
        )
    elif provider == "openai":
        return ChatOpenAI(
            model=model,
            temperature=0,
            api_key=os.getenv("OPENAI_API_KEY"),
        )
    elif provider == "azure_openai":
        return AzureChatOpenAI(
            azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", model),
            temperature=0,
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
        )
    elif provider == "groq":
        return ChatGroq(
            model=model,
            temperature=0,
            api_key=os.getenv("GROQ_API_KEY"),
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")


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
    "You are a helpful assistant. Use the available tools to answer "
    "questions based only on the uploaded documents. "
    "Format your responses using Markdown for better readability:\n"
    "- Use **bold** for emphasis and important points\n"
    "- Use bullet points for lists\n"
    "- Use numbered lists for sequential steps\n"
    "- Use headings (##) for sections when appropriate\n"
    "- Use code blocks for technical content\n"
    "Provide clear, well-structured answers."
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


def _answer_node(state: GraphState, provider: str = "azure_openai", model: str = "gpt-4o") -> GraphState:
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


async def arun_graph(question: str, collection_id: str, provider: str = "azure_openai", model: str = "gpt-4o") -> dict:
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
        existing_messages = current_state.values.get("messages", []) if current_state.values else []
        
        result = await compiled_app.ainvoke(
            {"question": question, "collection_id": collection_id, "messages": existing_messages},
            config=config,
        )
    return {"answer": result["answer"], "thread_id": collection_id}


async def arun_graph_stream(question: str, collection_id: str, provider: str = "azure_openai", model: str = "gpt-4o"):
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
            state_history = []
            
            # Get all checkpoint states for this thread
            async for state in checkpointer.alist(config):
                if state and state.values:
                    state_history.append(state.values)
            
            # Extract messages from the most recent state
            if state_history:
                # Get the most recent state
                latest_state = state_history[0]
                
                # Extract question/answer pairs
                messages = []
                if "question" in latest_state and latest_state["question"]:
                    messages.append({
                        "role": "user",
                        "content": latest_state["question"]
                    })
                if "answer" in latest_state and latest_state["answer"]:
                    messages.append({
                        "role": "assistant",
                        "content": latest_state["answer"]
                    })
                
                return messages
            
            return []
    except Exception as e:
        print(f"Error retrieving chat history: {e}")
        return []
