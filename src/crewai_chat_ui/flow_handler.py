"""Flow handler module for CrewAI Chat UI."""

import importlib.util
import inspect
import os
import re
import sys
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Type

try:
    from crewai.flow.flow import Flow
except ImportError:
    # Mock Flow class for development without crewai dependency
    class Flow:
        """Mock Flow class for development."""

        pass


def is_user_project_file(file_path: Path) -> bool:
    """Filter out virtual environment paths and other system paths."""
    # Convert path separators to forward slashes for consistent matching
    normalized_path = str(file_path).replace("\\", "/").lower()

    # Define excluded directory patterns - these are directories we want to exclude
    excluded_dirs = [
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

    # Check each part of the path against excluded directories
    path_parts = normalized_path.split("/")
    for part in path_parts:
        if part in excluded_dirs:
            return False

    # Include the file
    return True


def find_flow_modules(directory: Optional[Path] = None) -> List[Path]:
    """Find all flow modules in the specified or current working directory.

    Args:
        directory: Optional directory to search in. If None, uses current working directory.

    Returns:
        List of paths to potential flow files.
    """
    current_dir = directory or Path(os.getcwd())

    # Collect all potential flow files
    potential_flow_files = []

    # Look for main.py files as requested
    all_main_files = list(current_dir.glob("**/main.py"))
    filtered_main_files = [f for f in all_main_files if is_user_project_file(f)]

    potential_flow_files.extend(filtered_main_files)

    # If we still have no user project files, as a last resort, check all Python files in the directory
    if not potential_flow_files:
        all_py_files = list(current_dir.glob("**/*.py"))
        filtered_files = [f for f in all_py_files if is_user_project_file(f)]
        limited_files = filtered_files[:10]  # Limit to avoid excessive search
        potential_flow_files.extend(limited_files)

    # Remove potential duplicates while preserving order
    seen = set()
    unique_flow_files = []
    for file in potential_flow_files:
        if str(file) not in seen:
            seen.add(str(file))
            unique_flow_files.append(file)

    return unique_flow_files


def load_flow_from_module(flow_path: Path) -> List[Tuple[Type[Flow], str]]:
    """Load Flow classes from a module.

    Args:
        flow_path: Path to the flow module.

    Returns:
        List of tuples containing Flow class and flow name.

    Raises:
        ImportError: If the module cannot be imported.
    """
    # Get the module name from the file path
    module_name = flow_path.stem

    # Add parent directories to sys.path if they're not already there
    parent_dirs = []
    current_dir = flow_path.parent
    while current_dir != current_dir.parent:
        parent_dirs.append(str(current_dir.absolute()))
        current_dir = current_dir.parent

    for parent_dir in parent_dirs:
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)

    # Load the module
    spec = importlib.util.spec_from_file_location(module_name, flow_path)
    if spec is None:
        raise ImportError(f"Could not load module from {flow_path}")

    module = importlib.util.module_from_spec(spec)

    # Set up the module's __package__ attribute correctly for package imports
    if spec.submodule_search_locations:
        module.__package__ = spec.name
    else:
        module.__package__ = None

    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError as e:
        # Try to detect package structure and add appropriate directories to sys.path
        missing_module = str(e).split("'")[1] if "'" in str(e) else ""
        if missing_module:

            # Look for potential package roots
            potential_roots = []
            for parent_dir in parent_dirs:
                # Check if this is a src directory
                if os.path.basename(parent_dir) == "src":
                    potential_roots.append(os.path.dirname(parent_dir))

                # Check if this directory contains the missing module
                if os.path.exists(
                    os.path.join(parent_dir, missing_module.replace(".", os.sep))
                ):
                    potential_roots.append(parent_dir)

                # Check if the parent contains the missing module
                parent_of_parent = os.path.dirname(parent_dir)
                if os.path.exists(
                    os.path.join(parent_of_parent, missing_module.replace(".", os.sep))
                ):
                    potential_roots.append(parent_of_parent)

            # Add all potential roots to sys.path
            for root in potential_roots:
                if root not in sys.path:
                    sys.path.insert(0, root)

            # Try loading the module again
            try:
                spec.loader.exec_module(module)
            except Exception as e2:
                raise ImportError(f"Error executing module {flow_path}: {e2}")
        else:
            raise ImportError(f"Error executing module {flow_path}: {e}")
    except Exception as e:
        raise ImportError(f"Error executing module {flow_path}: {e}")

    # Find all Flow subclasses in the module
    flow_classes = []

    # List all classes in the module
    all_classes = []
    for name, obj in inspect.getmembers(module):
        if inspect.isclass(obj):
            all_classes.append((name, obj.__module__, obj.__name__))

    # Now find Flow subclasses
    for name, obj in inspect.getmembers(module):
        try:
            if inspect.isclass(obj):
                # Check if it's a Flow subclass
                is_subclass = issubclass(obj, Flow)
                is_not_flow = obj != Flow
                is_same_module = obj.__module__ == module.__name__
                is_main_py = flow_path.name == "main.py"

                # For main.py files, we don't need to check module name
                if is_subclass and is_not_flow and (is_same_module or is_main_py):
                    # Generate a display name from the class name
                    display_name = re.sub(
                        r"([a-z])([A-Z])", r"\1 \2", name
                    )  # Convert CamelCase to spaces
                    display_name = display_name.replace(
                        "_", " "
                    ).title()  # Convert snake_case to title case
                    display_name = re.sub(
                        r"\s*Flow$", "", display_name
                    )  # Remove 'Flow' suffix if present

                    flow_classes.append((obj, display_name or name))
        except Exception as e:
            print(f"Error checking class {name}: {e}")

    return flow_classes


class FlowHandler:
    """Handler for flow operations."""

    def __init__(self, flows_dir: Optional[Path] = None):
        """Initialize the flow handler.

        Args:
            flows_dir: Directory containing flow data. If None, uses current working directory.
        """
        self.flows_dir = flows_dir or Path(os.getcwd())
        self._flow_instances: Dict[str, Flow] = {}
        self._flow_metadata: Dict[str, Dict[str, Any]] = {}
        self._sample_flows = self._load_sample_flows()
        self._discover_flows()

    def _discover_flows(self) -> None:
        """Discover flows from the flows directory."""

        if not self.flows_dir.exists():
            return

        flow_modules = find_flow_modules(self.flows_dir)
        if not flow_modules:
            return

        for flow_path in flow_modules:
            try:
                flow_classes = load_flow_from_module(flow_path)
                if not flow_classes:
                    continue

                for flow_class, flow_name in flow_classes:
                    # Generate a unique ID for the flow
                    flow_id = f"{flow_class.__module__}.{flow_class.__name__}".lower()
                    print(f"Adding flow: {flow_name} (ID: {flow_id})")

                    # Create flow metadata
                    self._flow_metadata[flow_id] = {
                        "id": flow_id,
                        "name": flow_name,
                        "module": flow_class.__module__,
                        "class": flow_class.__name__,
                        "path": str(flow_path),
                        "description": flow_class.__doc__
                        or f"Flow from {flow_path.name}",
                    }

                    # Instantiate the flow (lazy loading)
                    # We'll instantiate it only when needed in get_flow()
            except Exception as e:
                print(f"Error loading flow from {flow_path}: {e}")

    def get_flows(self) -> List[Dict[str, Any]]:
        """Get all available flows.

        Returns:
            List of flow metadata.
        """
        # Combine discovered flows with sample flows
        flows = []

        # Add discovered flows if any
        if self._flow_metadata:
            for flow_id, metadata in self._flow_metadata.items():
                flows.append({"id": flow_id, "name": metadata["name"]})

        # Add sample flows if no real flows are discovered or if explicitly requested
        if (
            not flows
            or os.environ.get("INCLUDE_SAMPLE_FLOWS", "True").lower() == "true"
        ):
            flows.extend(self._get_flow_metadata_from_samples())

        return flows

    def get_flow(self, flow_id: str) -> Dict[str, Any]:
        """Get a specific flow by ID.

        Args:
            flow_id: ID of the flow to retrieve.

        Returns:
            Flow data.

        Raises:
            ValueError: If flow_id is not found.
        """
        # Check if it's a discovered flow
        if flow_id in self._flow_metadata:
            # If the flow hasn't been instantiated yet, do it now
            if flow_id not in self._flow_instances:
                try:
                    # Import the module and create an instance
                    metadata = self._flow_metadata[flow_id]
                    module_name = metadata["module"]
                    class_name = metadata["class"]

                    # Import the module
                    module = importlib.import_module(module_name)

                    # Get the class and instantiate it
                    flow_class = getattr(module, class_name)
                    flow_instance = flow_class()

                    # Store the instance
                    self._flow_instances[flow_id] = flow_instance
                except Exception as e:
                    raise ValueError(f"Error instantiating flow {flow_id}: {e}")

            # Get the flow instance
            flow_instance = self._flow_instances[flow_id]

            # Extract flow data
            metadata = self._flow_metadata[flow_id]

            # Get flow attributes
            agents = getattr(flow_instance, "agents", [])
            tasks = getattr(flow_instance, "tasks", [])

            # Format agents and tasks for the UI
            formatted_agents = []
            for i, agent in enumerate(agents):
                agent_name = getattr(agent, "name", f"Agent {i+1}")
                agent_role = getattr(agent, "role", "Worker")
                agent_description = getattr(
                    agent, "description", f"Description for {agent_name}"
                )

                formatted_agents.append(
                    {
                        "name": agent_name,
                        "role": agent_role,
                        "description": agent_description,
                    }
                )

            formatted_tasks = []
            for i, task in enumerate(tasks):
                task_title = getattr(task, "title", f"Task {i+1}")
                task_description = getattr(
                    task, "description", f"Description for {task_title}"
                )
                task_agent = getattr(task, "agent", None)
                task_agent_name = (
                    getattr(task_agent, "name", "Unassigned")
                    if task_agent
                    else "Unassigned"
                )

                formatted_tasks.append(
                    {
                        "title": task_title,
                        "status": "pending",  # Default status
                        "description": task_description,
                        "agent": task_agent_name,
                    }
                )

            # Get associated crew information if available
            crew_info = None
            try:
                print(f"Checking for crew in flow: {flow_id}")
                print(f"Flow instance attributes: {dir(flow_instance)}")
                
                # Check if the flow has a crew attribute
                if hasattr(flow_instance, 'crew'):
                    print(f"Flow has crew attribute: {flow_instance.crew}")
                    if flow_instance.crew is not None:
                        crew = flow_instance.crew
                        print(f"Crew object: {crew}")
                        print(f"Crew attributes: {dir(crew)}")
                        
                        crew_agents = getattr(crew, 'agents', [])
                        print(f"Crew agents: {crew_agents}")
                        
                        crew_agents_info = []
                        for agent in crew_agents:
                            print(f"Processing agent: {agent}")
                            print(f"Agent attributes: {dir(agent)}")
                            
                            agent_info = {
                                "name": getattr(agent, 'name', 'Unknown Agent'),
                                "role": getattr(agent, 'role', 'Unknown Role'),
                                "description": getattr(agent, 'description', 'No description available')
                            }
                            print(f"Agent info: {agent_info}")
                            crew_agents_info.append(agent_info)
                        
                        crew_info = {
                            "name": getattr(crew, 'name', 'Associated Crew'),
                            "description": getattr(crew, 'description', 'No description available'),
                            "agents": crew_agents_info
                        }
                        print(f"Final crew info: {crew_info}")
                else:
                    print(f"Flow does not have crew attribute")
                    
                    # Try to find crew in other attributes
                    for attr_name in dir(flow_instance):
                        if attr_name.startswith('__'):
                            continue
                        
                        attr = getattr(flow_instance, attr_name)
                        try:
                            if hasattr(attr, 'agents'):
                                print(f"Found potential crew in attribute: {attr_name}")
                                potential_crew = attr
                                crew_agents = getattr(potential_crew, 'agents', [])
                                
                                if crew_agents and len(crew_agents) > 0:
                                    print(f"Found crew agents in {attr_name}: {crew_agents}")
                                    
                                    crew_agents_info = []
                                    for agent in crew_agents:
                                        agent_info = {
                                            "name": getattr(agent, 'name', 'Unknown Agent'),
                                            "role": getattr(agent, 'role', 'Unknown Role'),
                                            "description": getattr(agent, 'description', 'No description available')
                                        }
                                        crew_agents_info.append(agent_info)
                                    
                                    crew_info = {
                                        "name": getattr(potential_crew, 'name', attr_name),
                                        "description": getattr(potential_crew, 'description', f"Crew from {attr_name}"),
                                        "agents": crew_agents_info
                                    }
                                    print(f"Created crew info from {attr_name}: {crew_info}")
                                    break
                        except Exception as inner_e:
                            print(f"Error checking attribute {attr_name}: {inner_e}")
            except Exception as e:
                print(f"Error getting crew information: {e}")
                import traceback
                print(traceback.format_exc())
                
            # Create flow data structure
            flow_data = {
                "name": metadata["name"],
                "description": metadata["description"],
                "created": "March 14, 2025",  # Placeholder
                "lastRun": "Never",  # Placeholder
                "metrics": {
                    "agents": len(formatted_agents),
                    "tasks": len(formatted_tasks),
                    "avgCompletionTime": "N/A",
                    "successRate": "N/A",
                },
                "agents": formatted_agents,
                "tasks": formatted_tasks,
            }
            
            # Add crew information if available
            if crew_info:
                print(f"Adding crew info to flow data: {crew_info}")
                flow_data["crew"] = crew_info
            else:
                # Add a placeholder crew for testing
                print("No crew info found, adding placeholder for testing")
                flow_data["crew"] = {
                    "name": "Test Crew",
                    "description": "This is a placeholder crew for testing purposes.",
                    "agents": [
                        {
                            "name": "Test Agent 1",
                            "role": "Tester",
                            "description": "A test agent to verify crew display functionality."
                        },
                        {
                            "name": "Test Agent 2",
                            "role": "Developer",
                            "description": "Another test agent to verify crew display functionality."
                        }
                    ]
                }

            return flow_data

        # If not a discovered flow, check sample flows
        if flow_id in self._sample_flows:
            return self._sample_flows[flow_id]

        raise ValueError(f"Flow with ID {flow_id} not found")

    def _get_flow_metadata_from_samples(self) -> List[Dict[str, Any]]:
        """Extract metadata from sample flows.

        Returns:
            List of flow metadata.
        """
        return [
            {"id": flow_id, "name": flow_data["name"]}
            for flow_id, flow_data in self._sample_flows.items()
        ]

    def _load_sample_flows(self) -> Dict[str, Dict[str, Any]]:
        """Load sample flow data.

        Returns:
            Dictionary of sample flows.
        """
        return {
            "content_generation": {
                "name": "Content Generation",
                "description": "This flow orchestrates the content generation process from research to publication.",
                "created": "March 14, 2025",
                "lastRun": "March 14, 2025 (10 minutes ago)",
                "metrics": {
                    "agents": 4,
                    "tasks": 6,
                    "avgCompletionTime": "3.5m",
                    "successRate": "98%",
                },
                "agents": [
                    {
                        "name": "Content Manager",
                        "role": "Manager",
                        "description": "Oversees the content creation process and ensures quality standards are met.",
                    },
                    {
                        "name": "Content Writer",
                        "role": "Worker",
                        "description": "Creates engaging and informative content based on research and outlines.",
                    },
                    {
                        "name": "Research Specialist",
                        "role": "Worker",
                        "description": "Gathers relevant information and data to support content creation.",
                    },
                    {
                        "name": "Quality Assurance",
                        "role": "Worker",
                        "description": "Reviews content for accuracy, clarity, and adherence to guidelines.",
                    },
                ],
                "tasks": [
                    {
                        "title": "Research Topic",
                        "status": "completed",
                        "description": "Gather relevant information and data about the topic from reliable sources.",
                        "agent": "Research Specialist",
                    },
                    {
                        "title": "Create Content Outline",
                        "status": "completed",
                        "description": "Develop a structured outline based on research findings.",
                        "agent": "Content Manager",
                    },
                    {
                        "title": "Write Draft Content",
                        "status": "in-progress",
                        "description": "Create the initial draft following the approved outline.",
                        "agent": "Content Writer",
                    },
                    {
                        "title": "Review Content",
                        "status": "pending",
                        "description": "Check for accuracy, clarity, and adherence to guidelines.",
                        "agent": "Quality Assurance",
                    },
                    {
                        "title": "Revise Content",
                        "status": "pending",
                        "description": "Make necessary revisions based on review feedback.",
                        "agent": "Content Writer",
                    },
                    {
                        "title": "Approve Final Content",
                        "status": "pending",
                        "description": "Final review and approval of the content before publication.",
                        "agent": "Content Manager",
                    },
                ],
            },
            "research_analysis": {
                "name": "Research & Analysis",
                "description": "This flow conducts comprehensive research and analysis on specified topics or datasets.",
                "created": "March 10, 2025",
                "lastRun": "March 13, 2025 (1 day ago)",
                "metrics": {
                    "agents": 3,
                    "tasks": 5,
                    "avgCompletionTime": "5.2m",
                    "successRate": "95%",
                },
                "agents": [
                    {
                        "name": "Research Lead",
                        "role": "Manager",
                        "description": "Coordinates the research process and ensures methodological rigor.",
                    },
                    {
                        "name": "Data Analyst",
                        "role": "Worker",
                        "description": "Processes and analyzes data using statistical methods and visualization techniques.",
                    },
                    {
                        "name": "Report Writer",
                        "role": "Worker",
                        "description": "Synthesizes findings into clear, actionable reports and recommendations.",
                    },
                ],
                "tasks": [
                    {
                        "title": "Define Research Scope",
                        "status": "completed",
                        "description": "Establish the parameters and objectives of the research project.",
                        "agent": "Research Lead",
                    },
                    {
                        "title": "Collect Data",
                        "status": "completed",
                        "description": "Gather relevant data from various sources according to the research scope.",
                        "agent": "Data Analyst",
                    },
                    {
                        "title": "Analyze Data",
                        "status": "completed",
                        "description": "Process and analyze the collected data using appropriate methods.",
                        "agent": "Data Analyst",
                    },
                    {
                        "title": "Synthesize Findings",
                        "status": "in-progress",
                        "description": "Interpret analysis results and identify key insights and patterns.",
                        "agent": "Research Lead",
                    },
                    {
                        "title": "Create Final Report",
                        "status": "pending",
                        "description": "Compile findings into a comprehensive report with visualizations and recommendations.",
                        "agent": "Report Writer",
                    },
                ],
            },
            "customer_support": {
                "name": "Customer Support",
                "description": "This flow manages customer inquiries and support requests from initial contact to resolution.",
                "created": "March 5, 2025",
                "lastRun": "March 14, 2025 (2 hours ago)",
                "metrics": {
                    "agents": 3,
                    "tasks": 4,
                    "avgCompletionTime": "2.8m",
                    "successRate": "92%",
                },
                "agents": [
                    {
                        "name": "Support Manager",
                        "role": "Manager",
                        "description": "Oversees the support process and handles escalations when needed.",
                    },
                    {
                        "name": "Technical Specialist",
                        "role": "Worker",
                        "description": "Provides technical expertise for complex product-related issues.",
                    },
                    {
                        "name": "Customer Service Rep",
                        "role": "Worker",
                        "description": "Handles initial customer contact and resolves common issues.",
                    },
                ],
                "tasks": [
                    {
                        "title": "Receive Inquiry",
                        "status": "completed",
                        "description": "Log and categorize incoming customer support requests.",
                        "agent": "Customer Service Rep",
                    },
                    {
                        "title": "Troubleshoot Issue",
                        "status": "in-progress",
                        "description": "Diagnose the problem and identify potential solutions.",
                        "agent": "Technical Specialist",
                    },
                    {
                        "title": "Implement Solution",
                        "status": "pending",
                        "description": "Apply the appropriate fix or workaround for the customer issue.",
                        "agent": "Technical Specialist",
                    },
                    {
                        "title": "Follow Up",
                        "status": "pending",
                        "description": "Check with the customer to ensure the issue is resolved satisfactorily.",
                        "agent": "Customer Service Rep",
                    },
                ],
            },
        }
