import importlib.util
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, Union, List, Dict, Any
import re

try:
    import tomli
except ImportError:
    tomli = None  # type: ignore

from crewai.crew import Crew


def is_user_project_file(file_path: Path) -> bool:
    """Filter out virtual environment paths and other system paths."""
    path_str = str(file_path).lower()
    excluded_patterns = [
        ".venv",
        "venv",
        "env",
        "site-packages",
        "__pycache__",
        ".git",
        "dist",
        "build",
        "egg-info",
    ]
    return not any(pattern in path_str for pattern in excluded_patterns)


def find_crew_modules(directory: Optional[Path] = None) -> List[Path]:
    """Find all crew modules in the specified or current working directory.

    Args:
        directory: Optional directory to search in. If None, uses current working directory.

    Returns:
        List of paths to potential crew files.
    """
    current_dir = directory or Path(os.getcwd())

    # Collect all potential crew files
    potential_crew_files = []

    # Look for the main crew files
    all_crew_files = list(current_dir.glob("**/crew.py"))
    potential_crew_files.extend([f for f in all_crew_files if is_user_project_file(f)])

    # Look for any *_crew.py files
    all_crew_files = list(current_dir.glob("**/*_crew.py"))
    potential_crew_files.extend([f for f in all_crew_files if is_user_project_file(f)])

    # Try specific common names as additional sources
    common_names = ["ai_crew.py", "agent_crew.py", "main_crew.py", "agents.py"]
    for name in common_names:
        all_matches = list(current_dir.glob(f"**/{name}"))
        matches = [f for f in all_matches if is_user_project_file(f)]
        potential_crew_files.extend(matches)

    # If we still have no user project files, as a last resort, check all Python files in the directory
    if not potential_crew_files:
        all_py_files = list(current_dir.glob("**/*.py"))
        # Filter out system files and keep only user project files
        filtered_files = [f for f in all_py_files if is_user_project_file(f)]
        potential_crew_files.extend(
            filtered_files[:10]
        )  # Limit to avoid excessive search

    # Remove potential duplicates while preserving order
    seen = set()
    unique_crew_files = []
    for file in potential_crew_files:
        if str(file) not in seen:
            seen.add(str(file))
            unique_crew_files.append(file)

    return unique_crew_files


def find_crew_module():
    """Find a single crew module in current working directory.

    Returns:
        The first matching crew module.

    Raises:
        FileNotFoundError: If no crew files are found.
    """
    potential_crew_files = find_crew_modules()

    if not potential_crew_files:
        raise FileNotFoundError(
            "Could not find crew.py or *_crew.py in the current directory or subdirectories."
        )

    # Return the first match
    return potential_crew_files[0]


def load_crew_from_module(crew_path: Path) -> Tuple[Crew, str]:
    """
    Load a crew instance from a specific module path.

    Args:
        crew_path: Path to the crew module file

    Returns:
        Tuple[Crew, str]: A tuple containing the crew instance and crew name

    Raises:
        Various exceptions based on loading failures
    """
    # Import the module
    module_name = crew_path.stem
    unique_module_name = f"{module_name}_{hash(str(crew_path)) % 10000}"

    try:
        spec = importlib.util.spec_from_file_location(unique_module_name, crew_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load module from {crew_path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules[unique_module_name] = module
        spec.loader.exec_module(module)
    except ModuleNotFoundError as e:
        # Handle missing module dependencies
        raise ImportError(
            f"Error loading module dependencies for {crew_path}: {str(e)}"
        )

    # Look for a Crew instance
    crew_instance = None
    crew_name = None

    # First, look for direct crew instances in the module
    for attr_name in dir(module):
        if attr_name.startswith("__"):  # Skip built-in attributes
            continue

        attr = getattr(module, attr_name)
        if isinstance(attr, Crew):
            crew_instance = attr
            crew_name = attr_name
            break

    # If no direct instance, look for classes that might have a crew method
    if crew_instance is None:
        for attr_name in dir(module):
            if attr_name.startswith("__"):  # Skip built-in attributes
                continue

            attr = getattr(module, attr_name)
            if isinstance(attr, type):  # Check if it's a class
                try:
                    # Try to instantiate the class
                    instance = attr()

                    # Look for crew methods on the instance
                    if hasattr(instance, "crew") and callable(
                        getattr(instance, "crew")
                    ):
                        try:
                            result = instance.crew()
                            if isinstance(result, Crew):
                                crew_instance = result
                                crew_name = f"{attr_name}.crew"
                                break
                        except Exception:
                            # Continue to the next class if this one fails
                            pass
                except Exception:
                    # Continue to the next class if this one fails
                    continue

    if crew_instance is None:
        raise ValueError(
            f"Could not find a Crew instance or a class with a crew method in {crew_path}."
        )

    # Generate a display name from the file path if needed
    if crew_name is None or crew_name == "crew":
        # Try to create a more meaningful name from the directory or file name
        parent_dir = crew_path.parent.name
        file_name = crew_path.stem

        if parent_dir and parent_dir != ".":
            # Convert snake_case or kebab-case to title case
            parent_name = re.sub(r"[_-]", " ", parent_dir).title()
            crew_name = parent_name
        else:
            # Convert the file name if it's not just 'crew.py'
            if file_name != "crew":
                # Convert snake_case or kebab-case to title case
                file_name = re.sub(r"[_-]", " ", file_name).title()
                # Remove 'Crew' suffix if present
                file_name = re.sub(r"\s*Crew$", "", file_name)
                crew_name = file_name
            else:
                crew_name = "Default Crew"

    return crew_instance, crew_name


def directory_contains_flows(directory: Path) -> bool:
    """
    Check if a directory contains any Python modules with classes that extend the Flow base class.

    Args:
        directory: Directory to check for Flow subclasses.

    Returns:
        True if the directory contains any Flow subclasses, False otherwise.
    """
    import inspect
    import importlib.util
    import sys

    # Try to import the Flow class
    try:
        from crewai.flow.flow import Flow
    except ImportError:
        # If Flow can't be imported, use a mock class for detection
        class Flow:
            """Mock Flow class for detection."""

            pass

    # Find all Python files in the directory
    python_files = list(directory.glob("**/*.py"))
    python_files = [f for f in python_files if is_user_project_file(f)]
    
    # Prioritize checking main.py files first as they often contain Flow subclasses
    main_py_files = list(directory.glob("**/main.py"))
    main_py_files = [f for f in main_py_files if is_user_project_file(f)]
    
    # Ensure main.py files are checked first
    for main_file in main_py_files:
        if main_file in python_files:
            python_files.remove(main_file)
    python_files = main_py_files + python_files

    # Check each Python file for Flow subclasses
    for py_file in python_files:
        try:
            # Generate a unique module name to avoid conflicts
            module_name = f"temp_module_{hash(str(py_file)) % 10000}"

            # Load the module
            spec = importlib.util.spec_from_file_location(module_name, py_file)
            if spec is None or spec.loader is None:
                continue

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module

            try:
                spec.loader.exec_module(module)
            except ImportError as e:
                # Skip files with import errors but print diagnostic info
                print(f"Import error when checking for flows in {py_file}: {str(e)}")
                continue
            except Exception as e:
                # Skip files that can't be executed for other reasons
                print(f"Error when checking for flows in {py_file}: {str(e)}")
                continue

            # Find all Flow subclasses in the module
            for name, obj in inspect.getmembers(module):
                if (
                    inspect.isclass(obj)
                    and issubclass(obj, Flow)
                    and obj != Flow
                    and obj.__module__ == module.__name__
                ):
                    # Found a Flow subclass
                    return True
        except Exception:
            # Skip files that can't be imported
            continue

    return False


def discover_available_crews(directory: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Discover all available crews in the specified directory.

    Args:
        directory: Optional directory to search in. If None, uses current working directory.

    Returns:
        List of dictionaries containing crew information:
            - path: Path to the crew module
            - name: Name of the crew
            - directory: Directory containing the crew (relative to search directory)
    """
    search_dir = directory or Path(os.getcwd())

    # Skip crew discovery if we're in a package directory structure
    # This helps avoid import issues with modules that expect to be imported as part of a package
    if (search_dir / "__init__.py").exists() and any((search_dir.parent / "__init__.py").exists(),
                                                  (search_dir.parent.parent / "__init__.py").exists()):
        print(f"Directory appears to be part of a package. Skipping crew discovery to avoid import conflicts.")
        return []
        
    # Check if the directory contains flows
    if directory_contains_flows(search_dir):
        print(
            f"Directory contains flows. Skipping crew discovery to avoid import conflicts."
        )
        return []

    try:
        crew_modules = find_crew_modules(search_dir)
    except Exception as e:
        print(f"Error finding crew modules: {e}")
        return []

    crews_info = []

    for crew_path in crew_modules:
        try:
            # Skip files in package directories that might cause import issues
            crew_dir = crew_path.parent
            # Check if this file is part of a Python package (has __init__.py files in parent directories)
            if ((crew_dir / "__init__.py").exists() and 
                ((crew_dir.parent / "__init__.py").exists() or 
                 (crew_dir.parent.parent / "__init__.py").exists())):
                print(f"Skipping crew file in package directory to avoid import issues: {crew_path}")
                continue

            # Try to get crew display name without loading the entire crew
            # This is a lightweight approach to just get names initially
            relative_path = crew_path.relative_to(search_dir)
            parent_dir = crew_path.parent.name
            file_name = crew_path.stem

            # Generate a display name from the file path
            if parent_dir and parent_dir != ".":
                # Convert snake_case or kebab-case to title case
                display_name = re.sub(r"[_-]", " ", parent_dir).title()
            else:
                # Convert the file name if it's not just 'crew.py'
                if file_name != "crew":
                    # Convert snake_case or kebab-case to title case
                    display_name = re.sub(r"[_-]", " ", file_name).title()
                    # Remove 'Crew' suffix if present
                    display_name = re.sub(r"\s*Crew$", "", display_name)
                else:
                    display_name = "Default Crew"

            crews_info.append(
                {
                    "path": str(crew_path),
                    "name": display_name,
                    "directory": str(
                        crew_path.parent.relative_to(search_dir)
                        if search_dir != crew_path.parent
                        else "."
                    ),
                }
            )
        except Exception as e:
            print(f"Error processing crew at {crew_path}: {e}")

    return crews_info


def load_crew() -> Tuple[Crew, Optional[str]]:
    """
    Load the crew instance from the user's project.
    Specifically looks for classes with crew methods.

    Returns:
        Tuple[Crew, str]: A tuple containing the crew instance and crew name
    """
    try:
        # Find the crew module
        crew_path = find_crew_module()
        return load_crew_from_module(crew_path)
    except Exception as e:
        raise
