"""
Tool discovery and loading utilities for CrewAI Chat UI.
"""
import inspect
import importlib
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional, get_type_hints, cast


def is_user_project_file(path):
    """Filter out system directories and files.
    
    Args:
        path: Path to check
        
    Returns:
        True if the path is a user project file, False otherwise
    """
    path_str = str(path)
    excluded_patterns = [
        "__pycache__",
        ".git",
        ".venv",
        "venv",
        "env",
        "node_modules",
        ".pytest_cache",
        ".mypy_cache",
        "dist",
        "build",
        "egg-info",
    ]
    return not any(pattern in path_str for pattern in excluded_patterns)


def discover_available_tools(directory: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Discover all available tools from any 'tools' directories in the project.
    
    Args:
        directory: Optional directory to search in. If None, uses current working directory.
        
    Returns:
        List of dictionaries containing tool information.
    """
    # Try different import paths for BaseTool
    BaseTool = None
    try:
        from crewai.tools import BaseTool
    except ImportError:
        try:
            from crewai_tools import BaseTool
        except ImportError:
            try:
                from crewai.tools.base_tool import BaseTool
            except ImportError:
                logging.error(
                    "BaseTool not found. Please ensure crewai is installed correctly."
                )
                return []

    tools_list = []
    
    # Use current working directory if no directory is specified
    current_dir = directory or Path(os.getcwd())
    
    # Find all tools directories
    tools_dirs = list(current_dir.glob("**/tools"))
    
    # Filter out system directories and keep only user project directories
    tools_dirs = [d for d in tools_dirs if is_user_project_file(d)]
    
    if not tools_dirs:
        logging.warning(f"No tools directories found in {current_dir}")
        return []
    
    # Process each tools directory
    for tools_dir in tools_dirs:
        logging.info(f"Searching for tools in {tools_dir}")
        
        for file_path in tools_dir.glob("*.py"):
            if file_path.name.startswith("__"):
                continue
                
            # Add the parent directory to sys.path temporarily to enable imports
            parent_dir = str(file_path.parent.parent)
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)
                
            # Determine the module name based on the file path
            relative_path = file_path.relative_to(Path(parent_dir))
            module_parts = list(relative_path.parts)
            module_parts[-1] = module_parts[-1].replace(".py", "")
            module_name = ".".join(module_parts)
            try:
                module = importlib.import_module(module_name)
                for attr_name in dir(module):
                    if attr_name.startswith("_"):
                        continue

                    attr = getattr(module, attr_name)
                    tool_info = None

                    # Class-based tools (BaseTool subclasses)
                    if (
                        inspect.isclass(attr)
                        and BaseTool is not None
                        and issubclass(attr, BaseTool)
                        and attr is not BaseTool
                    ):
                        tool_info = _extract_class_tool_info(attr, attr_name, module_name)

                    # Instance-based tools returned by @tool decorator
                    elif BaseTool is not None and isinstance(attr, BaseTool):
                        tool_info = _extract_instance_tool_info(attr, attr_name, module_name)

                    # Function-based tools (decorated with @tool)
                    elif inspect.isfunction(attr) and (hasattr(attr, "_crewai_tool") or 
                                                      hasattr(attr, "name") or 
                                                      getattr(attr, "__crewai_tool__", False)):

                        tool_info = _extract_function_tool_info(
                            attr, attr_name, module_name
                        )

                    if tool_info:
                        tools_list.append(tool_info)

            except Exception as e:
                logging.error(f"Error discovering tools in {file_path}: {e}")

    return tools_list


def _extract_class_tool_info(
    tool_class, attr_name: str, module_name: str
) -> Dict[str, Any]:
    """Extract tool information from a BaseTool subclass."""

    # Get tool name - try multiple ways
    tool_name = attr_name
    if hasattr(tool_class, "name"):
        tool_name = tool_class.name
    elif hasattr(tool_class, "model_fields") and "name" in tool_class.model_fields:
        name_field = tool_class.model_fields["name"]
        if hasattr(name_field, "default") and name_field.default is not None:
            tool_name = name_field.default

    # Get tool description
    tool_description = "No description available"
    if hasattr(tool_class, "description"):
        tool_description = tool_class.description
    elif (
        hasattr(tool_class, "model_fields") and "description" in tool_class.model_fields
    ):
        desc_field = tool_class.model_fields["description"]
        if hasattr(desc_field, "default") and desc_field.default is not None:
            tool_description = desc_field.default
    elif tool_class.__doc__:
        tool_description = tool_class.__doc__.strip()

    # Extract parameters from args_schema
    parameters = {"type": "object", "properties": {}, "required": []}

    if hasattr(tool_class, "args_schema") and tool_class.args_schema is not None:
        parameters = _extract_schema_parameters(tool_class.args_schema)
    else:
        # Fallback: try to extract from _run method signature
        if hasattr(tool_class, "_run"):
            parameters = _extract_method_parameters(tool_class._run)

    return {
        "name": tool_name,
        "description": tool_description.strip(),
        "parameters": parameters,
        "module": module_name,
        "class_name": attr_name,
        "is_class": True,
    }


def _extract_function_tool_info(
    tool_func, attr_name: str, module_name: str
) -> Dict[str, Any]:
    """Extract tool information from a function decorated with @tool."""

    # For CrewAI tool decorator, the name can be stored in different attributes
    # Try multiple ways to get the tool name
    tool_name = attr_name
    if hasattr(tool_func, "name"):
        tool_name = tool_func.name
    elif hasattr(tool_func, "_crewai_tool") and hasattr(tool_func._crewai_tool, "name"):
        tool_name = tool_func._crewai_tool.name
    
    # Get tool description from docstring or _crewai_tool attribute
    tool_description = "No description available"
    if tool_func.__doc__:
        tool_description = tool_func.__doc__.strip()
    elif hasattr(tool_func, "_crewai_tool") and hasattr(tool_func._crewai_tool, "description"):
        tool_description = tool_func._crewai_tool.description

    # Extract parameters from function signature
    parameters = _extract_method_parameters(tool_func)

    return {
        "name": tool_name,
        "description": tool_description,
        "parameters": parameters,
        "module": module_name,
        "class_name": attr_name,
        "is_class": False,
    }


def _ensure_property_descriptions(parameters: Dict[str, Any]):
    """Ensure each property in the JSON schema has a non-empty description."""
    if not parameters or not isinstance(parameters, dict):
        return
        
    for prop_name, prop_schema in parameters.get("properties", {}).items():
        # Always copy title to description if title exists
        if prop_schema.get("title"):
            prop_schema["description"] = prop_schema["title"]
        # If no description exists, add a default one
        elif not prop_schema.get("description"):
            prop_schema["description"] = f"Parameter: {prop_name}"
        
        # Handle nested properties (for objects)
        if prop_schema.get("type") == "object" and "properties" in prop_schema:
            _ensure_property_descriptions(prop_schema)


def _extract_schema_parameters(schema_class) -> Dict[str, Any]:
    """Extract parameters from a Pydantic schema class."""
    import logging

    parameters: Dict[str, Any] = {"type": "object", "properties": {}, "required": []}
    # Ensure required is a list
    required_list: List[str] = []
    # Ensure properties is a dictionary
    properties_dict: Dict[str, Any] = {}
    parameters["properties"] = properties_dict
    parameters["required"] = required_list

    try:
        # Try Pydantic v2 first
        if hasattr(schema_class, "model_json_schema"):
            schema_dict = schema_class.model_json_schema()
            if "properties" in schema_dict:
                parameters["properties"] = schema_dict["properties"]
            if "required" in schema_dict:
                # Make sure we're assigning a list
                parameters["required"] = list(schema_dict["required"])
            return parameters

        # Try Pydantic v1
        elif hasattr(schema_class, "schema"):
            schema_dict = schema_class.schema()
            if "properties" in schema_dict:
                parameters["properties"] = schema_dict["properties"]
            if "required" in schema_dict:
                # Make sure we're assigning a list
                parameters["required"] = list(schema_dict["required"])
            return parameters

        # Manual extraction using model_fields (Pydantic v2)
        elif hasattr(schema_class, "model_fields"):
            for field_name, field_info in schema_class.model_fields.items():
                field_type = "string"  # default
                field_desc = f"Parameter: {field_name}"

                # Get field type
                if hasattr(field_info, "annotation"):
                    annotation = field_info.annotation
                    if hasattr(annotation, "__name__"):
                        type_name = annotation.__name__.lower()
                        if "int" in type_name:
                            field_type = "integer"
                        elif "float" in type_name:
                            field_type = "number"
                        elif "bool" in type_name:
                            field_type = "boolean"
                        elif "list" in type_name:
                            field_type = "array"

                # Get field description
                if hasattr(field_info, "description") and field_info.description:
                    field_desc = field_info.description

                parameters["properties"][field_name] = {
                    "type": field_type,
                    "description": field_desc,
                }

                # Check if field is required
                if hasattr(field_info, "default"):
                    if field_info.default is ...:  # Ellipsis indicates required field
                        required_list.append(field_name)
                else:
                    required_list.append(field_name)

        # Manual extraction using __fields__ (Pydantic v1)
        elif hasattr(schema_class, "__fields__"):
            for field_name, field_info in schema_class.__fields__.items():
                field_type = "string"  # default
                field_desc = f"Parameter: {field_name}"

                # Get field type
                if hasattr(field_info, "type_"):
                    type_name = getattr(field_info.type_, "__name__", "").lower()
                    if "int" in type_name:
                        field_type = "integer"
                    elif "float" in type_name:
                        field_type = "number"
                    elif "bool" in type_name:
                        field_type = "boolean"
                    elif "list" in type_name:
                        field_type = "array"

                # Get field description
                if hasattr(field_info, "field_info") and hasattr(
                    field_info.field_info, "description"
                ):
                    if field_info.field_info.description:
                        field_desc = field_info.field_info.description

                parameters["properties"][field_name] = {
                    "type": field_type,
                    "description": field_desc,
                }

                # Check if field is required
                if field_info.required:
                    required_list.append(field_name)

        else:
            logging.warning(
                f"Could not extract schema from {schema_class.__name__}: unsupported schema format"
            )

    except Exception as e:
        logging.error(f"Error extracting schema from {schema_class.__name__}: {e}")

    _ensure_property_descriptions(parameters)
    return parameters


def _extract_instance_tool_info(tool_instance, attr_name: str, module_name: str) -> Dict[str, Any]:
    """Extract information from a BaseTool *instance* (returned by @tool decorator)."""
    # Try to get name and description attributes present in BaseTool
    tool_name = getattr(tool_instance, "name", attr_name)
    tool_description = getattr(tool_instance, "description", "No description available").strip()

    # Parameters: If the instance has args_schema use same logic
    parameters: Dict[str, Any] = {"type": "object", "properties": {}, "required": []}
    if hasattr(tool_instance, "args_schema") and tool_instance.args_schema is not None:
        parameters = _extract_schema_parameters(tool_instance.args_schema)
    elif hasattr(tool_instance, "_run"):
        parameters = _extract_method_parameters(tool_instance._run)

    return {
        "name": tool_name,
        "description": tool_description,
        "parameters": parameters,
        "module": module_name,
        "class_name": attr_name,
        "is_class": False,
    }


def _extract_method_parameters(method) -> Dict[str, Any]:
    """Extract parameters from a method signature."""
    import inspect
    from typing import get_type_hints

    parameters: Dict[str, Any] = {"type": "object", "properties": {}, "required": []}
    # Ensure required is a list
    required_list: List[str] = []
    # Ensure properties is a dictionary
    properties_dict: Dict[str, Any] = {}
    parameters["properties"] = properties_dict
    parameters["required"] = required_list

    try:
        sig = inspect.signature(method)
        annotations = get_type_hints(method)

        for param_name, param in sig.parameters.items():
            if param_name == "self":
                continue

            # Determine parameter type
            param_type = annotations.get(param_name, str)
            type_name = getattr(param_type, "__name__", "string").lower()

            json_type = "string"  # default
            if "int" in type_name:
                json_type = "integer"
            elif "float" in type_name:
                json_type = "number"
            elif "bool" in type_name:
                json_type = "boolean"
            elif "list" in type_name:
                json_type = "array"
            elif "dict" in type_name:
                json_type = "object"

            properties_dict[param_name] = {
                "type": json_type,
                "description": f"Parameter: {param_name}",
            }

            # Check if parameter is required
            if param.default == inspect.Parameter.empty:
                required_list.append(param_name)

    except Exception as e:
        logging.error(f"Error extracting method parameters: {e}")

    _ensure_property_descriptions(parameters)
    return parameters
