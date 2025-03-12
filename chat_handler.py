import json
from typing import Dict, List, Any, Optional
import threading
import time

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
        self.messages = []
        self.crew_chat_inputs = None
        self.crew_tool_schema = None
        self.available_functions = {}
        self.is_initialized = False
        
    def _initialize_chat_llm(self) -> Optional[LLM]:
        """Initialize the chat LLM from the crew."""
        try:
            return create_llm(self.crew.chat_llm)
        except Exception as e:
            raise RuntimeError(f"Unable to initialize chat LLM: {str(e)}")
    
    def initialize(self):
        """Initialize the chat handler by analyzing the crew and setting up schemas."""
        if self.is_initialized:
            return
            
        # Generate crew chat inputs
        self.crew_chat_inputs = generate_crew_chat_inputs(
            self.crew, self.crew_name, self.chat_llm
        )
        
        # Generate tool schema
        self.crew_tool_schema = generate_crew_tool_schema(self.crew_chat_inputs)
        
        # Set up system message
        system_message = build_system_message(self.crew_chat_inputs)
        
        # Generate introductory message
        introductory_message = self.chat_llm.call(
            messages=[{"role": "system", "content": system_message}]
        )
        
        # Initialize messages
        self.messages = [
            {"role": "system", "content": system_message},
            {"role": "assistant", "content": introductory_message},
        ]
        
        # Set up available functions
        self.available_functions = {
            self.crew_chat_inputs.crew_name: self._create_tool_function(),
        }
        
        self.is_initialized = True
        return introductory_message
    
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
        
        try:
            # Call the LLM with the updated messages including tool schema
            response = self.chat_llm.call(
                messages=self.messages,
                tools=[self.crew_tool_schema],
                tool_choice="auto"
            )
            
            # Handle the response
            content = response.get("content", "")
            tool_calls = response.get("tool_calls", [])
            
            # Add assistant response to messages
            self.messages.append({"role": "assistant", "content": content})
            
            # Process any tool calls
            if tool_calls:
                for tool_call in tool_calls:
                    # Extract function name and arguments
                    function_name = tool_call["function"]["name"]
                    function_args = tool_call["function"]["arguments"]
                    
                    # Add the tool call to messages
                    self.messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [tool_call]
                    })
                    
                    # Execute the function
                    if function_name in self.available_functions:
                        function_to_call = self.available_functions[function_name]
                        function_args_dict = json.loads(function_args)
                        function_response = function_to_call(**function_args_dict)
                        
                        # Add the function response to messages
                        self.messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": function_response
                        })
                        
                        # Get LLM to summarize the function response
                        summary_response = self.chat_llm.call(messages=self.messages)
                        summary_content = summary_response.get("content", "")
                        
                        # Add the summary response to messages
                        self.messages.append({
                            "role": "assistant", 
                            "content": summary_content
                        })
                        
                        # Update the content for the return value
                        content = summary_content
            
            return {
                "status": "success",
                "content": content,
                "has_tool_call": bool(tool_calls)
            }
            
        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            self.messages.append({"role": "assistant", "content": error_message})
            return {
                "status": "error",
                "content": error_message,
                "has_tool_call": False
            }
