import importlib.util
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, Union

try:
    import tomli
except ImportError:
    tomli = None

from crewai.crew import Crew


def find_crew_module():
    """Find crew module in current working directory."""
    current_dir = Path(os.getcwd())
    
    # Look for the main crew file
    potential_crew_files = list(current_dir.glob("**/crew.py"))
    
    if not potential_crew_files:
        # Look for any *_crew.py files
        potential_crew_files = list(current_dir.glob("**/*_crew.py"))
    
    if not potential_crew_files:
        raise FileNotFoundError(
            "Could not find crew.py or *_crew.py in the current directory or subdirectories."
        )
    
    # Return the first match
    return potential_crew_files[0]


def load_crew() -> Tuple[Crew, str]:
    """
    Load the crew instance from the user's project.
    
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
        
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if isinstance(attr, Crew):
                crew_instance = attr
                crew_name = attr_name
                break
        
        if crew_instance is None:
            # If no instance found, look for a function that returns a Crew
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if callable(attr) and attr_name.lower().startswith(("get_", "create_", "build_")):
                    try:
                        result = attr()
                        if isinstance(result, Crew):
                            crew_instance = result
                            crew_name = attr_name
                            break
                    except:
                        continue
        
        if crew_instance is None:
            raise ValueError("No Crew instance found in module.")
        
        return crew_instance, crew_name
    
    except Exception as e:
        raise RuntimeError(f"Failed to load crew: {str(e)}")
