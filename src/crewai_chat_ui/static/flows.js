document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const themeToggle = document.getElementById('theme-toggle-switch');
    const flowSelect = document.getElementById('flow-select');
    const agentsList = document.getElementById('agents-list');
    const flowTitle = document.querySelector('.header h1');
    const flowDescription = document.querySelector('.flow-info p:nth-child(2)');
    const flowCanvas = document.getElementById('flow-canvas');
    const taskList = document.querySelector('.task-list');
    
    // Metrics elements
    const agentsCount = document.querySelector('.metric-card:nth-child(1) .metric-value');
    const tasksCount = document.querySelector('.metric-card:nth-child(2) .metric-value');
    const avgCompletionTime = document.querySelector('.metric-card:nth-child(3) .metric-value');
    const successRate = document.querySelector('.metric-card:nth-child(4) .metric-value');
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.checked = true;
    }
    
    // Theme toggle functionality
    themeToggle.addEventListener('change', function() {
        if (this.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
    });
    
    // Load available flows
    function loadAvailableFlows() {
        // Fetch flows from the API
        fetch('/api/flows')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.flows && data.flows.length > 0) {
                    const flows = data.flows;
                    
                    // Clear existing options except the placeholder
                    while (flowSelect.options.length > 1) {
                        flowSelect.remove(1);
                    }
                    
                    // Add flow options
                    flows.forEach(flow => {
                        const option = document.createElement('option');
                        option.value = flow.id;
                        option.textContent = flow.name;
                        flowSelect.appendChild(option);
                    });
                    
                    // Load the first flow by default
                    if (flows.length > 0) {
                        flowSelect.value = flows[0].id;
                        loadFlowData(flows[0].id);
                    }
                } else {
                    console.error('No flows found or API error');
                    // Show a message to the user
                    flowTitle.textContent = 'No Flows Available';
                    flowDescription.innerHTML = '<strong>Error:</strong> No flows were found. Please create a flow to get started.';
                }
            })
            .catch(error => {
                console.error('Error loading flows:', error);
                // Show error message to the user
                flowTitle.textContent = 'Error Loading Flows';
                flowDescription.innerHTML = '<strong>Error:</strong> Unable to load flows. Please try again later.';
            });
    }
    
    // Load flow data
    function loadFlowData(flowId) {
        // Show loading state
        flowTitle.textContent = 'Loading Flow...';
        flowDescription.innerHTML = '<strong>Please wait:</strong> Loading flow data...';
        agentsList.innerHTML = '<div class="loading">Loading agents...</div>';
        taskList.innerHTML = '<div class="loading">Loading tasks...</div>';
        
        // Fetch flow data from the API
        fetch(`/api/flows/${flowId}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.flow) {
                    // Update UI with flow data
                    updateFlowUI(data.flow);
                } else {
                    console.error('Error loading flow data:', data.message || 'Unknown error');
                    // Show error message
                    flowTitle.textContent = 'Error Loading Flow';
                    flowDescription.innerHTML = `<strong>Error:</strong> ${data.message || 'Unable to load flow data. Please try again later.'}`;
                    agentsList.innerHTML = '<div class="error">Could not load agents</div>';
                    taskList.innerHTML = '<div class="error">Could not load tasks</div>';
                }
            })
            .catch(error => {
                console.error('Error loading flow data:', error);
                // Show error message
                flowTitle.textContent = 'Error Loading Flow';
                flowDescription.innerHTML = '<strong>Error:</strong> Unable to load flow data. Please try again later.';
                agentsList.innerHTML = '<div class="error">Could not load agents</div>';
                taskList.innerHTML = '<div class="error">Could not load tasks</div>';
            });
    }
    
    // Update UI with flow data
    function updateFlowUI(flowData) {
        // Update header and description
        flowTitle.textContent = flowData.name + ' Flow';
        flowDescription.innerHTML = '<strong>Description:</strong> ' + flowData.description;
        
        // Update metrics
        agentsCount.textContent = flowData.metrics.agents;
        tasksCount.textContent = flowData.metrics.tasks;
        avgCompletionTime.textContent = flowData.metrics.avgCompletionTime;
        successRate.textContent = flowData.metrics.successRate;
        
        // Update agents list
        agentsList.innerHTML = '';
        flowData.agents.forEach(agent => {
            const agentCard = document.createElement('div');
            agentCard.className = 'agent-card';
            
            let iconClass = 'fa-user';
            if (agent.name.includes('Manager') || agent.name.includes('Lead')) {
                iconClass = 'fa-user-tie';
            } else if (agent.name.includes('Writer')) {
                iconClass = 'fa-pen-fancy';
            } else if (agent.name.includes('Research') || agent.name.includes('Analyst')) {
                iconClass = 'fa-magnifying-glass';
            } else if (agent.name.includes('Quality') || agent.name.includes('QA')) {
                iconClass = 'fa-check-double';
            } else if (agent.name.includes('Tech')) {
                iconClass = 'fa-laptop-code';
            } else if (agent.name.includes('Customer')) {
                iconClass = 'fa-headset';
            }
            
            agentCard.innerHTML = `
                <h3><i class="fa-solid ${iconClass}"></i> ${agent.name}</h3>
                <p>${agent.description}</p>
                <span class="agent-role">${agent.role}</span>
            `;
            
            agentsList.appendChild(agentCard);
        });
        
        // Update tasks list
        taskList.innerHTML = '';
        flowData.tasks.forEach(task => {
            const taskCard = document.createElement('div');
            taskCard.className = 'task-card';
            
            let iconClass = 'fa-tasks';
            if (task.agent.includes('Manager') || task.agent.includes('Lead')) {
                iconClass = 'fa-user-tie';
            } else if (task.agent.includes('Writer')) {
                iconClass = 'fa-pen-fancy';
            } else if (task.agent.includes('Research') || task.agent.includes('Analyst')) {
                iconClass = 'fa-magnifying-glass';
            } else if (task.agent.includes('Quality') || task.agent.includes('QA')) {
                iconClass = 'fa-check-double';
            } else if (task.agent.includes('Tech')) {
                iconClass = 'fa-laptop-code';
            } else if (task.agent.includes('Customer')) {
                iconClass = 'fa-headset';
            }
            
            taskCard.innerHTML = `
                <div class="task-header">
                    <h3 class="task-title">${task.title}</h3>
                    <span class="task-status ${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</span>
                </div>
                <p class="task-description">${task.description}</p>
                <div class="task-agent">
                    <i class="fa-solid ${iconClass}"></i>
                    <span>Assigned to: ${task.agent}</span>
                </div>
            `;
            
            taskList.appendChild(taskCard);
        });
        
        // In a real implementation, we would update the flow visualization
        // For now, we'll just reload the iframe to simulate this
        flowCanvas.src = '/static/flow-diagram.html';
    }
    
    // Flow selection change
    flowSelect.addEventListener('change', function() {
        loadFlowData(this.value);
    });
    
    // Canvas control buttons (for demonstration)
    document.querySelectorAll('.canvas-control-btn').forEach(button => {
        button.addEventListener('click', function() {
            // In a real implementation, these would control the canvas zoom/pan
            console.log('Canvas control clicked:', this.title);
        });
    });
    
    // Run flow button
    document.querySelector('.action-btn.primary').addEventListener('click', function() {
        alert('This would trigger the flow execution in a real implementation.');
    });
    
    // Initialize the page
    loadAvailableFlows();
});
