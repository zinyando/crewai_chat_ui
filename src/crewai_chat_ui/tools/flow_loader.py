"""
Flow Loader for CrewAI Chat UI

This module provides functionality to discover and load CrewAI flows from
the user's environment, similar to how crews are discovered.
"""

import os
import sys
import importlib.util
import inspect
from typing import Dict, List, Any, Optional, Tuple
import logging
import uuid
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set this module's logger to a higher level to reduce noise
logger.setLevel(logging.WARNING)


class FlowInput(BaseModel):
    """Model for flow input parameters"""

    name: str
    description: str


class FlowInfo(BaseModel):
    """Model for flow information"""

    id: str
    name: str
    description: str
    file_path: str
    class_name: str
    required_inputs: List[FlowInput] = []


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
        # Skip __pycache__ directories
        if (
            "__pycache__" in root
            or ".venv" in root
            or "venv" in root
            or "site-packages" in root
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
        # Generate a random module name to avoid conflicts
        module_name = f"flow_module_{uuid.uuid4().hex}"

        # Get the directory of the file for handling relative imports
        file_dir = os.path.dirname(file_path)
        
        # Add the file's directory to sys.path temporarily to handle relative imports
        sys_path_modified = False
        if file_dir not in sys.path:
            sys.path.insert(0, file_dir)
            sys_path_modified = True
            
        # Load the module
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec is None or spec.loader is None:
            return []

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        # Inspect all classes in the module
        for name, obj in inspect.getmembers(module):
            # Check if it's a class and inherits from Flow
            if (
                inspect.isclass(obj)
                and name != "Flow"  # Skip the base Flow class
                and hasattr(obj, "__module__")
                and obj.__module__ == module_name
            ):

                # Try to determine if this is a Flow class by checking for typical attributes/methods
                if (
                    hasattr(obj, "run")
                    and inspect.isfunction(getattr(obj, "run"))
                    and (hasattr(obj, "nodes") or hasattr(obj, "add_node"))
                ):

                    # Extract flow information
                    flow_id = str(uuid.uuid4())
                    flow_name = name
                    flow_description = obj.__doc__ or f"Flow: {name}"

                    # Extract required inputs by inspecting the __init__ method
                    required_inputs = extract_flow_inputs(obj)

                    flow_info = FlowInfo(
                        id=flow_id,
                        name=flow_name,
                        description=flow_description,
                        file_path=file_path,
                        class_name=name,
                        required_inputs=required_inputs,
                    )

                    flows.append(flow_info)

    except ImportError as e:
        # Common import errors should be logged at debug level
        logger.debug(f"Import error extracting flows from {file_path}: {str(e)}")
    except Exception as e:
        # Other errors at debug level too
        logger.debug(f"Error extracting flows from {file_path}: {str(e)}")
    finally:
        # Remove the directory from sys.path if we added it
        if sys_path_modified and file_dir in sys.path:
            sys.path.remove(file_dir)

    return flows


def extract_flow_inputs(flow_class) -> List[FlowInput]:
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
                # Skip parameters with default values
                if param.default is inspect.Parameter.empty:
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

                    inputs.append(FlowInput(name=name, description=description))

    except Exception as e:
        logger.error(f"Error extracting inputs from flow class: {str(e)}")

    return inputs


def load_flow(flow_info: FlowInfo, inputs: Dict[str, Any]) -> Any:
    """
    Load and instantiate a Flow class with the provided inputs.

    Args:
        flow_info: FlowInfo object containing information about the flow
        inputs: Dictionary of input parameters for the flow

    Returns:
        Instantiated Flow object
    """
    try:
        # Generate a random module name to avoid conflicts
        module_name = f"flow_module_{uuid.uuid4().hex}"

        # Load the module
        spec = importlib.util.spec_from_file_location(module_name, flow_info.file_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load module from {flow_info.file_path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        # Get the Flow class
        flow_class = getattr(module, flow_info.class_name)

        # Instantiate the Flow with inputs
        flow_instance = flow_class(**inputs)

        return flow_instance

    except Exception as e:
        logger.error(f"Error loading flow {flow_info.name}: {str(e)}")
        raise
