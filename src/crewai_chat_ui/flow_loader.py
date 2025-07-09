"""
Flow Loader for CrewAI Chat UI

This module provides functionality to discover and load CrewAI flows from
the user's environment, similar to how crews are discovered.
"""

import os
import sys
import importlib.util
import inspect
from typing import Dict, List, Any, Optional, Tuple, Union
import logging
import uuid
from pydantic import BaseModel
import ast
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set this module's logger to a higher level to reduce noise
logger.setLevel(logging.WARNING)


class FlowInput(BaseModel):
    """Model for flow input parameters"""

    name: str
    description: str
    type_hint: str = "Any"
    required: bool = True


class FlowMethod(BaseModel):
    """Model for flow method information"""

    name: str
    description: str
    is_start: bool = False
    is_listener: bool = False
    listens_to: List[str] = []
    is_router: bool = False
    has_persist: bool = False


class FlowInfo(BaseModel):
    """Model for flow information"""

    id: str
    name: str
    description: str
    file_path: str
    class_name: str
    required_inputs: List[FlowInput] = []
    methods: List[FlowMethod] = []
    state_type: str = "unstructured"  # "structured" or "unstructured"
    state_model: Optional[str] = None


def discover_flows(directory: str = None) -> List[FlowInfo]:
    """
    Discover all Flow classes in the specified directory or current working directory.

    Args:
        directory: Directory to search for flow files. If None, uses current working directory.

    Returns:
        List of FlowInfo objects containing information about discovered flows.
    """
    if directory is None:
        directory = os.getcwd()

    logger.info(f"Discovering flows in {directory}")

    flows = []

    # Walk through the directory
    for root, _, files in os.walk(directory):
        # Skip __pycache__ directories and common virtual environment directories
        if any(
            skip_dir in root
            for skip_dir in [
                "__pycache__",
                ".venv",
                "venv",
                "site-packages",
                ".git",
                "node_modules",
            ]
        ):
            continue

        # Look for Python files
        for file in files:
            if not file.endswith(".py"):
                continue

            file_path = os.path.join(root, file)

            try:
                # Extract flow classes from the file
                file_flows = extract_flows_from_file(file_path)
                flows.extend(file_flows)
            except Exception as e:
                # Log at debug level instead of error for non-flow files
                logger.debug(f"Error processing file {file_path}: {str(e)}")

    logger.info(f"Discovered {len(flows)} flows")
    return flows


def extract_flows_from_file(file_path: str) -> List[FlowInfo]:
    """
    Extract Flow classes from a Python file.

    Args:
        file_path: Path to the Python file

    Returns:
        List of FlowInfo objects for flows found in the file
    """
    flows = []

    try:
        # First, try to parse the file with AST to check for Flow classes
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Quick check if this file might contain flows
        if not _contains_flow_indicators(content):
            return []

        # Generate a random module name to avoid conflicts
        module_name = f"flow_module_{uuid.uuid4().hex}"

        # Get the directory of the file for handling relative imports
        file_dir = os.path.dirname(file_path)

        # Add the file's directory to sys.path temporarily to handle relative imports
        sys_path_modified = False
        if file_dir not in sys.path:
            sys.path.insert(0, file_dir)
            sys_path_modified = True

        try:
            # Load the module
            spec = importlib.util.spec_from_file_location(module_name, file_path)
            if spec is None or spec.loader is None:
                return []

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            # Inspect all classes in the module
            for name, obj in inspect.getmembers(module):
                # Check if it's a class and potentially a Flow
                if (
                    inspect.isclass(obj)
                    and name != "Flow"  # Skip the base Flow class
                    and hasattr(obj, "__module__")
                    and obj.__module__ == module_name
                ):

                    # Check if the class is a CrewAI Flow
                    if _is_flow_class(obj):
                        try:
                            # Extract flow information
                            flow_info = _extract_flow_info(
                                obj, file_path, name, content
                            )
                            flows.append(flow_info)
                        except Exception as e:
                            logger.debug(
                                f"Error extracting flow info for {name}: {str(e)}"
                            )

        finally:
            # Clean up module from sys.modules
            if module_name in sys.modules:
                del sys.modules[module_name]

            # Remove the directory from sys.path if we added it
            if sys_path_modified and file_dir in sys.path:
                sys.path.remove(file_dir)

    except ImportError as e:
        # Common import errors should be logged at debug level
        logger.debug(f"Import error extracting flows from {file_path}: {str(e)}")
    except Exception as e:
        # Other errors at debug level too
        logger.debug(f"Error extracting flows from {file_path}: {str(e)}")

    return flows


def _contains_flow_indicators(content: str) -> bool:
    """
    Quick check if file content might contain CrewAI Flow classes.

    Args:
        content: File content as string

    Returns:
        True if file might contain flows, False otherwise
    """
    indicators = [
        "from crewai",
        "import crewai",
        "Flow",
        "@start",
        "@listen",
        "@router",
        "@persist",
        "kickoff",
    ]

    content_lower = content.lower()
    return any(indicator.lower() in content_lower for indicator in indicators)


def _is_flow_class(obj) -> bool:
    """
    Check if a class is a CrewAI Flow class.

    Args:
        obj: Class object to check

    Returns:
        True if it's a Flow class, False otherwise
    """
    try:
        # Try to import the Flow class from crewai
        from crewai.flow.flow import Flow as CrewAIFlow

        # Check if the class inherits from CrewAIFlow
        if issubclass(obj, CrewAIFlow):
            return True
    except ImportError:
        pass

    # Alternative check: Look for typical Flow characteristics
    # CrewAI Flows typically have:
    # 1. Methods with @start, @listen, @router decorators
    # 2. A kickoff method (inherited)
    # 3. A state attribute

    has_flow_decorators = False
    has_kickoff = hasattr(obj, "kickoff")

    # Check for methods with flow decorators
    for method_name, method in inspect.getmembers(obj, predicate=inspect.ismethod):
        if hasattr(method, "__annotations__") or hasattr(method, "__wrapped__"):
            # Look for decorator indicators in the method
            method_str = str(method)
            if any(
                decorator in method_str
                for decorator in ["start", "listen", "router", "persist"]
            ):
                has_flow_decorators = True
                break

    # Also check unbound methods
    for method_name, method in inspect.getmembers(obj, predicate=inspect.isfunction):
        if hasattr(method, "__annotations__") or hasattr(method, "__wrapped__"):
            method_str = str(method)
            if any(
                decorator in method_str
                for decorator in ["start", "listen", "router", "persist"]
            ):
                has_flow_decorators = True
                break

    return has_flow_decorators or (has_kickoff and _has_flow_methods(obj))


def _has_flow_methods(obj) -> bool:
    """
    Check if class has typical flow methods by examining source code.

    Args:
        obj: Class object to check

    Returns:
        True if it has flow-like methods, False otherwise
    """
    try:
        source = inspect.getsource(obj)
        flow_patterns = [
            r"@start\(\)",
            r"@listen\(",
            r"@router\(",
            r"@persist\(",
            r"def\s+\w+.*:\s*.*self\.state",
        ]

        return any(re.search(pattern, source) for pattern in flow_patterns)
    except:
        return False


def _extract_flow_info(
    flow_class, file_path: str, class_name: str, file_content: str
) -> FlowInfo:
    """
    Extract detailed information from a Flow class.

    Args:
        flow_class: The Flow class object
        file_path: Path to the file containing the class
        class_name: Name of the class
        file_content: Content of the file as string

    Returns:
        FlowInfo object with detailed information
    """
    flow_id = str(uuid.uuid4())
    flow_name = class_name
    flow_description = flow_class.__doc__ or f"Flow: {class_name}"

    # Extract required inputs by inspecting the __init__ method
    required_inputs = _extract_flow_inputs(flow_class)

    # Extract methods information
    methods = _extract_flow_methods(flow_class, file_content)

    # Determine state type
    state_type, state_model = _determine_state_type(flow_class, file_content)

    return FlowInfo(
        id=flow_id,
        name=flow_name,
        description=flow_description,
        file_path=file_path,
        class_name=class_name,
        required_inputs=required_inputs,
        methods=methods,
        state_type=state_type,
        state_model=state_model,
    )


def _extract_flow_inputs(flow_class) -> List[FlowInput]:
    """
    Extract required inputs from a Flow class by inspecting its __init__ method.

    Args:
        flow_class: The Flow class to inspect

    Returns:
        List of FlowInput objects representing the required inputs
    """
    inputs = []

    try:
        # Get the __init__ method signature
        if hasattr(flow_class, "__init__"):
            signature = inspect.signature(flow_class.__init__)

            # Skip 'self' parameter
            for name, param in list(signature.parameters.items())[1:]:
                # Skip parameters with default values unless they're required
                if param.default is not inspect.Parameter.empty:
                    continue

                # Get type hint
                type_hint = "Any"
                if param.annotation != inspect.Parameter.empty:
                    type_hint = str(param.annotation)

                # Try to get description from docstring
                description = ""
                if flow_class.__init__.__doc__:
                    doc_lines = flow_class.__init__.__doc__.split("\n")
                    for line in doc_lines:
                        if f"{name}:" in line:
                            description = line.split(f"{name}:")[1].strip()
                            break

                if not description:
                    description = f"Input parameter: {name}"

                inputs.append(
                    FlowInput(
                        name=name,
                        description=description,
                        type_hint=type_hint,
                        required=True,
                    )
                )

    except Exception as e:
        logger.debug(f"Error extracting inputs from flow class: {str(e)}")

    return inputs


def _extract_flow_methods(flow_class, file_content: str) -> List[FlowMethod]:
    """
    Extract method information from a Flow class.

    Args:
        flow_class: The Flow class to inspect
        file_content: Content of the file as string

    Returns:
        List of FlowMethod objects
    """
    methods = []

    try:
        # Get all methods from the class
        class_methods = inspect.getmembers(flow_class, predicate=inspect.isfunction)

        for method_name, method in class_methods:
            # Skip private methods and inherited methods
            if method_name.startswith("_") or method_name in ["kickoff", "plot"]:
                continue

            # Extract method information from source code
            method_info = _analyze_method_from_source(method_name, file_content)

            if method_info:
                methods.append(method_info)

    except Exception as e:
        logger.debug(f"Error extracting methods from flow class: {str(e)}")

    return methods


def _analyze_method_from_source(
    method_name: str, file_content: str
) -> Optional[FlowMethod]:
    """
    Analyze a method from source code to extract Flow-specific information.

    Args:
        method_name: Name of the method
        file_content: Content of the file as string

    Returns:
        FlowMethod object or None if not a flow method
    """
    try:
        # Find the method definition in the source
        method_pattern = rf"def\s+{method_name}\s*\("
        match = re.search(method_pattern, file_content)

        if not match:
            return None

        # Extract the method section (including decorators)
        start_pos = match.start()

        # Find the start of decorators (look backwards for @)
        lines = file_content[:start_pos].split("\n")
        decorator_start = len(lines) - 1

        # Look for decorators above the method
        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if line.startswith("@"):
                decorator_start = i
            elif line and not line.startswith("@"):
                break

        # Get the method section
        method_section = "\n".join(lines[decorator_start:])

        # Add the method definition and some content
        remaining_content = file_content[start_pos:]
        method_lines = remaining_content.split("\n")

        # Find the end of the method (next method or class end)
        method_end = 0
        indent_level = None

        for i, line in enumerate(method_lines):
            if i == 0:
                continue
            stripped = line.strip()
            if not stripped:
                continue

            # Determine indentation level from first non-empty line
            if indent_level is None:
                indent_level = len(line) - len(line.lstrip())

            # If we find a line with same or less indentation, we've reached the end
            current_indent = len(line) - len(line.lstrip())
            if (
                current_indent <= indent_level
                and stripped
                and not stripped.startswith("#")
            ):
                method_end = i
                break

        if method_end > 0:
            method_section += "\n" + "\n".join(method_lines[:method_end])
        else:
            method_section += "\n" + "\n".join(method_lines[:10])  # Take first 10 lines

        # Analyze decorators and content
        is_start = "@start()" in method_section
        is_listener = "@listen(" in method_section
        is_router = "@router(" in method_section
        has_persist = "@persist(" in method_section or "@persist" in method_section

        # Extract listen targets
        listens_to = []
        if is_listener:
            listen_matches = re.findall(r"@listen\(([^)]+)\)", method_section)
            for match in listen_matches:
                # Clean up the match and extract method names
                targets = re.findall(r"[\w\.]+", match)
                listens_to.extend(targets)

        # Extract description from docstring
        description = ""
        docstring_match = re.search(
            rf'def\s+{method_name}\s*\([^)]*\):\s*"""([^"]+)"""', method_section
        )
        if docstring_match:
            description = docstring_match.group(1).strip()
        else:
            description = f"Flow method: {method_name}"

        return FlowMethod(
            name=method_name,
            description=description,
            is_start=is_start,
            is_listener=is_listener,
            listens_to=listens_to,
            is_router=is_router,
            has_persist=has_persist,
        )

    except Exception as e:
        logger.debug(f"Error analyzing method {method_name}: {str(e)}")
        return None


def _determine_state_type(flow_class, file_content: str) -> Tuple[str, Optional[str]]:
    """
    Determine the state management type used by the flow.

    Args:
        flow_class: The Flow class to inspect
        file_content: Content of the file as string

    Returns:
        Tuple of (state_type, state_model_name)
    """
    try:
        # Look for structured state patterns
        state_patterns = [
            r"class\s+(\w+State?)\s*\(\s*BaseModel\s*\)",
            r"class\s+(\w+State?)\s*\(\s*.*BaseModel.*\)",
        ]

        for pattern in state_patterns:
            match = re.search(pattern, file_content)
            if match:
                return "structured", match.group(1)

        # Check if the class has a state attribute definition
        if hasattr(flow_class, "__annotations__"):
            annotations = flow_class.__annotations__
            if "state" in annotations:
                state_type = str(annotations["state"])
                if "BaseModel" in state_type:
                    return "structured", state_type

    except Exception as e:
        logger.debug(f"Error determining state type: {str(e)}")

    return "unstructured", None


def load_flow(flow_info: FlowInfo, inputs: Dict[str, Any] = None) -> Any:
    """
    Load and instantiate a Flow class with the provided inputs.

    Args:
        flow_info: FlowInfo object containing information about the flow
        inputs: Dictionary of input parameters for the flow

    Returns:
        Instantiated Flow object
    """
    if inputs is None:
        inputs = {}

    try:
        # Generate a random module name to avoid conflicts
        module_name = f"flow_module_{uuid.uuid4().hex}"

        # Get the directory of the file for handling relative imports
        file_dir = os.path.dirname(flow_info.file_path)

        # Add the file's directory to sys.path temporarily
        sys_path_modified = False
        if file_dir not in sys.path:
            sys.path.insert(0, file_dir)
            sys_path_modified = True

        try:
            # Load the module
            spec = importlib.util.spec_from_file_location(
                module_name, flow_info.file_path
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load module from {flow_info.file_path}")

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            # Get the Flow class
            flow_class = getattr(module, flow_info.class_name)

            # Filter inputs to only include those expected by the constructor
            signature = inspect.signature(flow_class.__init__)
            filtered_inputs = {}

            for param_name, param in signature.parameters.items():
                if param_name == "self":
                    continue
                if param_name in inputs:
                    filtered_inputs[param_name] = inputs[param_name]
                elif param.default is inspect.Parameter.empty:
                    # Required parameter not provided
                    logger.warning(
                        f"Required parameter '{param_name}' not provided for flow {flow_info.name}"
                    )

            # Instantiate the Flow with filtered inputs
            flow_instance = flow_class(**filtered_inputs)

            return flow_instance

        finally:
            # Clean up
            if module_name in sys.modules:
                del sys.modules[module_name]

            if sys_path_modified and file_dir in sys.path:
                sys.path.remove(file_dir)

    except Exception as e:
        logger.error(f"Error loading flow {flow_info.name}: {str(e)}")
        raise


def run_flow(flow_info: FlowInfo, inputs: Dict[str, Any] = None) -> Any:
    """
    Load and run a Flow with the provided inputs.

    Args:
        flow_info: FlowInfo object containing information about the flow
        inputs: Dictionary of input parameters for the flow

    Returns:
        Flow execution result
    """
    try:
        # Load the flow
        flow_instance = load_flow(flow_info, inputs)

        # Run the flow
        result = flow_instance.kickoff()

        return result

    except Exception as e:
        logger.error(f"Error running flow {flow_info.name}: {str(e)}")
        raise


def get_flow_state(flow_instance) -> Dict[str, Any]:
    """
    Get the current state of a flow instance.

    Args:
        flow_instance: The flow instance

    Returns:
        Dictionary representation of the flow state
    """
    try:
        if hasattr(flow_instance, "state"):
            state = flow_instance.state
            if hasattr(state, "model_dump"):
                # Structured state (Pydantic model)
                return state.model_dump()
            else:
                # Unstructured state (dict)
                return dict(state) if state else {}
        return {}
    except Exception as e:
        logger.error(f"Error getting flow state: {str(e)}")
        return {}


# Utility functions for flow management
def validate_flow_inputs(flow_info: FlowInfo, inputs: Dict[str, Any]) -> List[str]:
    """
    Validate that all required inputs are provided.

    Args:
        flow_info: FlowInfo object
        inputs: Dictionary of input parameters

    Returns:
        List of validation errors (empty if valid)
    """
    errors = []

    for required_input in flow_info.required_inputs:
        if required_input.required and required_input.name not in inputs:
            errors.append(f"Required input '{required_input.name}' is missing")

    return errors


def get_flow_summary(flow_info: FlowInfo) -> Dict[str, Any]:
    """
    Get a summary of flow information.

    Args:
        flow_info: FlowInfo object

    Returns:
        Dictionary with flow summary
    """
    return {
        "id": flow_info.id,
        "name": flow_info.name,
        "description": flow_info.description,
        "file_path": flow_info.file_path,
        "required_inputs": len(flow_info.required_inputs),
        "methods": len(flow_info.methods),
        "state_type": flow_info.state_type,
        "start_methods": [m.name for m in flow_info.methods if m.is_start],
        "listener_methods": [m.name for m in flow_info.methods if m.is_listener],
        "router_methods": [m.name for m in flow_info.methods if m.is_router],
    }
