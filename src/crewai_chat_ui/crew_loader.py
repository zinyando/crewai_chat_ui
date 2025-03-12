import importlib.util
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, Union

try:
    import tomli
except ImportError:
    tomli = None  # type: ignore

from crewai.crew import Crew


def find_crew_module():
    """Find crew module in current working directory."""
    current_dir = Path(os.getcwd())

    # Function to filter out virtual environment paths and other system paths
    def is_user_project_file(file_path: Path) -> bool:
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

    # Look for the main crew file
    all_crew_files = list(current_dir.glob("**/crew.py"))
    potential_crew_files = [f for f in all_crew_files if is_user_project_file(f)]

    if not potential_crew_files:
        # Look for any *_crew.py files
        all_crew_files = list(current_dir.glob("**/*_crew.py"))
        potential_crew_files = [f for f in all_crew_files if is_user_project_file(f)]

    if not potential_crew_files:
        # Try specific common names as a last resort
        common_names = ["ai_crew.py", "agent_crew.py", "main_crew.py", "agents.py"]
        for name in common_names:
            all_matches = list(current_dir.glob(f"**/{name}"))
            matches = [f for f in all_matches if is_user_project_file(f)]
            if matches:
                potential_crew_files = matches
                break

    if not potential_crew_files:
        # As a very last resort, check all Python files in the directory
        all_py_files = list(current_dir.glob("**/*.py"))
        # Filter out system files and keep only user project files
        filtered_files = [f for f in all_py_files if is_user_project_file(f)]
        if filtered_files:
            potential_crew_files = filtered_files[
                :5
            ]  # Limit to first 5 to avoid excessive search

    # If we still have no user project files but have system files, use the system files as a last resort
    if not potential_crew_files:
        potential_crew_files = all_crew_files or list(current_dir.glob("**/*_crew.py"))

    if not potential_crew_files:
        raise FileNotFoundError(
            "Could not find crew.py or *_crew.py in the current directory or subdirectories."
        )

    # Return the first match
    return potential_crew_files[0]


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

        # Import the module
        module_name = crew_path.stem

        spec = importlib.util.spec_from_file_location(module_name, crew_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load module from {crew_path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        # Look for a Crew instance
        crew_instance = None
        crew_name = None

        # Look for classes that might have a crew method
        print("Looking for classes with crew methods...")
        for attr_name in dir(module):
            if attr_name.startswith("__"):  # Skip built-in attributes
                continue

            attr = getattr(module, attr_name)
            if isinstance(attr, type):  # Check if it's a class
                print(f"  Found class: {attr_name}")
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
                        except Exception as e:
                            print(f"  Error calling {attr_name}.crew(): {e}")
                except Exception as e:
                    print(f"  Error instantiating class {attr_name}: {e}")
                    continue

        if crew_instance is None:
            raise ValueError(
                "Could not find a class with a crew method. "
                "Please ensure your file contains a class with a method that returns a Crew instance."
            )

        # Ensure crew_name is not None before returning
        if crew_name is None:
            crew_name = "crew"  # Default name if none was found

        return crew_instance, crew_name

    except Exception as e:
        raise
