"""Flow handler module for CrewAI Chat UI."""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional


class FlowHandler:
    """Handler for flow operations."""

    def __init__(self, flows_dir: Optional[Path] = None):
        """Initialize the flow handler.
        
        Args:
            flows_dir: Directory containing flow data. If None, uses sample data.
        """
        self.flows_dir = flows_dir
        self._sample_flows = self._load_sample_flows()

    def get_flows(self) -> List[Dict[str, Any]]:
        """Get all available flows.
        
        Returns:
            List of flow metadata.
        """
        if self.flows_dir and self.flows_dir.exists():
            # In a real implementation, this would load flows from files
            # For now, we'll use sample data
            return self._get_flow_metadata_from_samples()
        return self._get_flow_metadata_from_samples()

    def get_flow(self, flow_id: str) -> Dict[str, Any]:
        """Get a specific flow by ID.
        
        Args:
            flow_id: ID of the flow to retrieve.
            
        Returns:
            Flow data.
            
        Raises:
            ValueError: If flow_id is not found.
        """
        if flow_id not in self._sample_flows:
            raise ValueError(f"Flow with ID {flow_id} not found")
        return self._sample_flows[flow_id]

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
                    "successRate": "98%"
                },
                "agents": [
                    {
                        "name": "Content Manager",
                        "role": "Manager",
                        "description": "Oversees the content creation process and ensures quality standards are met."
                    },
                    {
                        "name": "Content Writer",
                        "role": "Worker",
                        "description": "Creates engaging and informative content based on research and outlines."
                    },
                    {
                        "name": "Research Specialist",
                        "role": "Worker",
                        "description": "Gathers relevant information and data to support content creation."
                    },
                    {
                        "name": "Quality Assurance",
                        "role": "Worker",
                        "description": "Reviews content for accuracy, clarity, and adherence to guidelines."
                    }
                ],
                "tasks": [
                    {
                        "title": "Research Topic",
                        "status": "completed",
                        "description": "Gather relevant information and data about the topic from reliable sources.",
                        "agent": "Research Specialist"
                    },
                    {
                        "title": "Create Content Outline",
                        "status": "completed",
                        "description": "Develop a structured outline based on research findings.",
                        "agent": "Content Manager"
                    },
                    {
                        "title": "Write Draft Content",
                        "status": "in-progress",
                        "description": "Create the initial draft following the approved outline.",
                        "agent": "Content Writer"
                    },
                    {
                        "title": "Review Content",
                        "status": "pending",
                        "description": "Check for accuracy, clarity, and adherence to guidelines.",
                        "agent": "Quality Assurance"
                    },
                    {
                        "title": "Revise Content",
                        "status": "pending",
                        "description": "Make necessary revisions based on review feedback.",
                        "agent": "Content Writer"
                    },
                    {
                        "title": "Approve Final Content",
                        "status": "pending",
                        "description": "Final review and approval of the content before publication.",
                        "agent": "Content Manager"
                    }
                ]
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
                    "successRate": "95%"
                },
                "agents": [
                    {
                        "name": "Research Lead",
                        "role": "Manager",
                        "description": "Coordinates the research process and ensures methodological rigor."
                    },
                    {
                        "name": "Data Analyst",
                        "role": "Worker",
                        "description": "Processes and analyzes data using statistical methods and visualization techniques."
                    },
                    {
                        "name": "Report Writer",
                        "role": "Worker",
                        "description": "Synthesizes findings into clear, actionable reports and recommendations."
                    }
                ],
                "tasks": [
                    {
                        "title": "Define Research Scope",
                        "status": "completed",
                        "description": "Establish the parameters and objectives of the research project.",
                        "agent": "Research Lead"
                    },
                    {
                        "title": "Collect Data",
                        "status": "completed",
                        "description": "Gather relevant data from various sources according to the research scope.",
                        "agent": "Data Analyst"
                    },
                    {
                        "title": "Analyze Data",
                        "status": "completed",
                        "description": "Process and analyze the collected data using appropriate methods.",
                        "agent": "Data Analyst"
                    },
                    {
                        "title": "Synthesize Findings",
                        "status": "in-progress",
                        "description": "Interpret analysis results and identify key insights and patterns.",
                        "agent": "Research Lead"
                    },
                    {
                        "title": "Create Final Report",
                        "status": "pending",
                        "description": "Compile findings into a comprehensive report with visualizations and recommendations.",
                        "agent": "Report Writer"
                    }
                ]
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
                    "successRate": "92%"
                },
                "agents": [
                    {
                        "name": "Support Manager",
                        "role": "Manager",
                        "description": "Oversees the support process and handles escalations when needed."
                    },
                    {
                        "name": "Technical Specialist",
                        "role": "Worker",
                        "description": "Provides technical expertise for complex product-related issues."
                    },
                    {
                        "name": "Customer Service Rep",
                        "role": "Worker",
                        "description": "Handles initial customer contact and resolves common issues."
                    }
                ],
                "tasks": [
                    {
                        "title": "Receive Inquiry",
                        "status": "completed",
                        "description": "Log and categorize incoming customer support requests.",
                        "agent": "Customer Service Rep"
                    },
                    {
                        "title": "Troubleshoot Issue",
                        "status": "in-progress",
                        "description": "Diagnose the problem and identify potential solutions.",
                        "agent": "Technical Specialist"
                    },
                    {
                        "title": "Implement Solution",
                        "status": "pending",
                        "description": "Apply the appropriate fix or workaround for the customer issue.",
                        "agent": "Technical Specialist"
                    },
                    {
                        "title": "Follow Up",
                        "status": "pending",
                        "description": "Check with the customer to ensure the issue is resolved satisfactorily.",
                        "agent": "Customer Service Rep"
                    }
                ]
            }
        }
