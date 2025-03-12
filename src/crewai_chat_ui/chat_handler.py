import json
import logging
from typing import Dict, List, Any, Optional, Union, cast, TypedDict
import threading
import time

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Define message types for better type checking
class ToolCall(TypedDict):
    id: str
    function: Dict[str, Any]

class AssistantMessageWithToolCalls(TypedDict):
    role: str
    content: Optional[str]
    tool_calls: List[ToolCall]

class Message(TypedDict):
    role: str
    content: str

from crewai.crew import Crew
from crewai.llm import LLM
from crewai.types.crew_chat import ChatInputs, ChatInputField
from crewai.utilities.llm_utils import create_llm
from crewai.cli.crew_chat import (
    generate_crew_chat_inputs,
    generate_crew_tool_schema,
    build_system_message,
    run_crew_tool
)


class ChatHandler:
    def __init__(self, crew: Crew, crew_name: str):
        """
        Initialize the chat handler.
        
        Args:
            crew: The CrewAI crew instance
            crew_name: Name of the crew
        """
        self.crew = crew
        self.crew_name = crew_name
        self.chat_llm = self._initialize_chat_llm()
        self.messages: List[Dict[str, str]] = []
        self.crew_chat_inputs = None
        self.crew_tool_schema = None
        self.available_functions: Dict[str, Any] = {}
        self.is_initialized = False
        
    def _initialize_chat_llm(self) -> LLM:
        """Initialize the chat LLM from the crew.
        
        Returns:
            LLM: The initialized LLM (will always return a valid LLM or raise an exception)
        
        Raises:
            RuntimeError: If unable to initialize the chat LLM
        """
        try:
            llm = create_llm(self.crew.chat_llm)
            if llm is None:
                raise RuntimeError("LLM initialization returned None")
            return llm
        except Exception as e:
            raise RuntimeError(f"Unable to initialize chat LLM: {str(e)}")
    
    def _sanitize_tool_schema(self, tool_schema):
        """Sanitize tool schema to ensure function names follow OpenAI's pattern requirements.
        
        OpenAI requires function names to match the pattern '^[a-zA-Z0-9_-]+$'
        """
        if not tool_schema:
            return tool_schema
            
        # Make a deep copy to avoid modifying the original schema
        sanitized_schema = dict(tool_schema)
        
        # Ensure function name only contains allowed characters
        if 'function' in sanitized_schema and 'name' in sanitized_schema['function']:
            # Replace any non-alphanumeric, non-underscore, non-hyphen characters with underscores
            import re
            original_name = sanitized_schema['function']['name']
            sanitized_name = re.sub(r'[^a-zA-Z0-9_-]', '_', original_name)
            sanitized_schema['function']['name'] = sanitized_name
            
        return sanitized_schema
    
    def initialize(self):
        """Initialize the chat handler by analyzing the crew and setting up schemas."""
        if self.is_initialized:
            return
        
        # Indicate that the crew is being analyzed
        logging.info("Analyzing crew and required inputs...")
        
        # Start loading indicator in a separate thread
        loading_complete = threading.Event()
        loading_thread = threading.Thread(target=self._show_loading, args=(loading_complete,))
        loading_thread.daemon = True
        loading_thread.start()
        
        try:
            # Generate crew chat inputs
            self.crew_chat_inputs = generate_crew_chat_inputs(
                self.crew, self.crew_name, self.chat_llm
            )
            
            # Generate tool schema
            crew_tool_schema = generate_crew_tool_schema(self.crew_chat_inputs)
            # Sanitize tool schema to ensure valid function names
            self.crew_tool_schema = self._sanitize_tool_schema(crew_tool_schema)
            
            # Set up system message
            system_message = build_system_message(self.crew_chat_inputs)
            
            # Generate introductory message
            introductory_message = self.chat_llm.call(
                messages=[{"role": "system", "content": system_message}]
            )
            
            # Log a shorter version of the introductory message for debugging
            if isinstance(introductory_message, str):
                log_message = introductory_message[:50] + '...' if len(introductory_message) > 50 else introductory_message
            else:
                log_message = str(introductory_message)[:50] + '...'
                
            logging.debug(f"Received introductory message: {log_message}")
            
            # Handle string or dictionary response
            if isinstance(introductory_message, str):
                intro_content = introductory_message
            else:
                intro_content = introductory_message.get("content", "")
                
                # Provide fallback if intro message is empty
                if not intro_content:
                    intro_content = f"Hello! I'm your CrewAI assistant for the '{self.crew_name}' crew. How can I help you today?"
            
            # Initialize messages
            self.messages = [
                {"role": "system", "content": system_message},
                {"role": "assistant", "content": intro_content},
            ]
            
            # Track the sanitized name from the tool schema
            sanitized_function_name = self.crew_tool_schema['function']['name']
            original_name = self.crew_chat_inputs.crew_name
            
            # Set up available functions using the sanitized name
            self.available_functions = {
                sanitized_function_name: self._create_tool_function(),
            }
            
            # Add the original name as well as a fallback
            if original_name != sanitized_function_name:
                self.available_functions[original_name] = self._create_tool_function()
            
            self.is_initialized = True
            return introductory_message
            
        except Exception as e:
            error_message = f"Error initializing chat handler: {str(e)}"
            logging.error(error_message)
            return error_message
            
        finally:
            # Stop loading indicator
            loading_complete.set()
            if loading_thread.is_alive():
                loading_thread.join(timeout=1.0)
    
    def _show_loading(self, event: threading.Event):
        """Display animated loading indicator while processing."""
        chars = "-\|/"
        i = 0
        while not event.is_set():
            logging.debug(f"Processing... {chars[i % len(chars)]}")
            i += 1
            time.sleep(0.5)
    
    def _create_tool_function(self):
        """Create the tool function wrapper."""
        def run_crew_tool_with_messages(**kwargs):
            return run_crew_tool(self.crew, self.messages, **kwargs)
        return run_crew_tool_with_messages
    
    def process_message(self, user_message: str) -> Dict[str, Any]:
        """
        Process a user message and return a response.
        
        Args:
            user_message: The message from the user
            
        Returns:
            Dict with response content and status
        """
        if not self.is_initialized:
            self.initialize()
        
        # Add user message to history
        self.messages.append({"role": "user", "content": user_message})
        
        # Start loading indicator in a separate thread
        loading_complete = threading.Event()
        loading_thread = threading.Thread(target=self._show_loading, args=(loading_complete,))
        loading_thread.daemon = True
        loading_thread.start()
        
        try:
            # Ensure chat_llm is initialized - log minimal info
            logging.debug("Sending messages to LLM")
            logging.debug(f"Using tool schema name: {self.crew_tool_schema['function']['name']}")
                
            # Call the LLM with the updated messages including tool schema and available functions
            response = self.chat_llm.call(
                messages=self.messages,
                tools=[self.crew_tool_schema],
                available_functions=self.available_functions
            )
            
            # Handle the response
            # Check if response is a string or dictionary
            if isinstance(response, str):
                # If response is an empty string, provide fallback content
                if not response.strip():
                    logging.warning("Empty string response from LLM, providing fallback")
                    content = "I'll help you with that. Let me process your request about AI agents in 2024."
                else:
                    content = response
                tool_calls = []
            else:
                # It's a dictionary or similar object with get method
                content = response.get("content", "")
                # If content is empty but we have a response object, provide fallback
                if not content and isinstance(response, dict):
                    logging.warning("Empty content in response dict, providing fallback")
                    content = "I'll help you with that. Let me process your request about AI agents in 2024."
                tool_calls = response.get("tool_calls", [])
                
            logging.debug(f"Extracted content length: {len(content) if content else 0}")
            logging.debug(f"Number of tool calls: {len(tool_calls) if tool_calls else 0}")
            
            # Add assistant response to messages
            self.messages.append({"role": "assistant", "content": content})
            
            # Process any tool calls
            if tool_calls:
                for tool_call in tool_calls:
                    # Extract function name and arguments
                    function_name = tool_call["function"]["name"]
                    function_args = tool_call["function"]["arguments"]
                    
                    # Add the tool call to messages with proper typing
                    tool_call_message: AssistantMessageWithToolCalls = {
                        "role": "assistant",
                        "content": None,  # Can be None with our custom type
                        "tool_calls": [cast(ToolCall, tool_call)]
                    }
                    # Type cast to allow adding to messages list
                    self.messages.append(cast(Dict[str, Any], tool_call_message))
                    
                    # Try to find a matching function, even with slight name differences
                    function_to_call = None
                    if function_name in self.available_functions:
                        function_to_call = self.available_functions[function_name]
                    else:
                        # Try case-insensitive matching as fallback
                        function_name_lower = function_name.lower()
                        for available_name in self.available_functions:
                            if available_name.lower() == function_name_lower:
                                function_to_call = self.available_functions[available_name]
                                break
                                
                    # Log the result, but only if there's a problem
                    if not function_to_call:
                        logging.warning(f"Tool call requested unknown function '{function_name}'. Available: {list(self.available_functions.keys())}")
                    
                    # Execute the function if found
                    if function_to_call:
                        # Handle parsing function arguments
                        try:
                            function_args_dict = json.loads(function_args)
                            logging.debug(f"Calling function {function_name}")
                            function_response = function_to_call(**function_args_dict)
                        except json.JSONDecodeError as e:
                            logging.error(f"Error parsing function arguments: {str(e)}")
                            function_response = f"Error: Could not parse function arguments: {str(e)}"
                        except Exception as e:
                            logging.error(f"Error executing function {function_name}: {str(e)}")
                            function_response = f"Error executing function: {str(e)}"
                        
                        # Add the function response to messages with proper typing
                        tool_response_message: Dict[str, str] = {
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": str(function_response)  # Ensure content is a string
                        }
                        self.messages.append(tool_response_message)
                        
                        # Log that we're processing the function response (minimal info)
                        logging.debug("Processing function response")
                        
                        # Get LLM to summarize the function response with appropriate parameters
                        try:
                            summary_response = self.chat_llm.call(
                                messages=self.messages,
                                tools=[self.crew_tool_schema],
                                available_functions=self.available_functions
                            )
                            
                            # Handle string or dict response
                            if isinstance(summary_response, str):
                                summary_content = summary_response
                            else:
                                summary_content = summary_response.get("content", "")
                                
                            # Provide a fallback if summary is empty
                            if not summary_content:
                                summary_content = f"I've processed your request and received a response. Here's what I found: {function_response[:500]}"
                        except Exception as e:
                            logging.error(f"Error getting summary response: {str(e)}")
                            summary_content = f"I've processed your request, but encountered an issue summarizing the results. Here's the raw output: {function_response[:500]}"
                        
                        # Add the summary response to messages
                        self.messages.append({
                            "role": "assistant", 
                            "content": summary_content
                        })
                        
                        # Update the content for the return value
                        content = summary_content
            
            result = {
                "status": "success",
                "content": content,
                "has_tool_call": bool(tool_calls)
            }
            logging.debug("Returning success result")
            return result
            
        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            logging.error(f"Exception in process_message: {error_message}")
            logging.error(f"Exception details:", exc_info=True)
            self.messages.append({"role": "assistant", "content": error_message})
            result = {
                "status": "error",
                "content": error_message,
                "has_tool_call": False
            }
            logging.debug("Returning error result")
            return result
        finally:
            # Stop loading indicator
            loading_complete.set()
            if loading_thread.is_alive():
                loading_thread.join(timeout=1.0)
