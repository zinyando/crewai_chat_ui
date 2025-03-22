document.addEventListener('DOMContentLoaded', function() {
    // Debug: Check if crew section exists on page load
    const initialCrewSection = document.getElementById('crew-section');
    if (initialCrewSection) {
        console.log('Crew section found on page load');
        console.log('Initial crew section style:', initialCrewSection.style.display);
        // Make sure crew section is visible initially
        initialCrewSection.style.display = 'block';
    } else {
        console.error('Crew section not found on page load');
    }
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
        console.log(`Loading flow data for: ${flowId}`);
        
        // Debug: Check if crew section exists before loading flow
        const preLoadCrewSection = document.getElementById('crew-section');
        if (preLoadCrewSection) {
            console.log('Crew section exists before loading flow data');
            console.log('Pre-load crew section display:', preLoadCrewSection.style.display);
            console.log('Pre-load crew section computed style:', window.getComputedStyle(preLoadCrewSection).display);
            console.log('Pre-load crew section parent:', preLoadCrewSection.parentElement);
        } else {
            console.error('Crew section does not exist before loading flow data');
        }
        
        // Show loading state
        flowTitle.textContent = 'Loading Flow...';
        flowDescription.innerHTML = '<strong>Please wait:</strong> Loading flow data...';
        agentsList.innerHTML = '<div class="loading">Loading agents...</div>';
        taskList.innerHTML = '<div class="loading">Loading tasks...</div>';
        
        // Fetch flow data from the API
        fetch(`/api/flows/${flowId}`)
            .then(response => {
                console.log('API response received');
                return response.json();
            })
            .then(data => {
                console.log('API data parsed:', data);
                if (data.status === 'success' && data.flow) {
                    console.log('Flow data received successfully');
                    console.log('Flow data crew:', data.flow.crew);
                    
                    // Debug: Check if crew section exists after API response
                    const postApiCrewSection = document.getElementById('crew-section');
                    if (postApiCrewSection) {
                        console.log('Crew section exists after API response');
                        console.log('Post-API crew section display:', postApiCrewSection.style.display);
                    } else {
                        console.error('Crew section does not exist after API response');
                    }
                    
                    // Update UI with flow data
                    updateFlowUI(data.flow);
                    
                    // Debug: Check crew section after UI update
                    setTimeout(() => {
                        const postUpdateCrewSection = document.getElementById('crew-section');
                        if (postUpdateCrewSection) {
                            console.log('Crew section exists after UI update');
                            console.log('Post-update crew section display:', postUpdateCrewSection.style.display);
                            console.log('Post-update crew section computed style:', window.getComputedStyle(postUpdateCrewSection).display);
                            console.log('Post-update crew section HTML:', postUpdateCrewSection.innerHTML);
                            console.log('Post-update crew section parent:', postUpdateCrewSection.parentElement);
                            
                            // Force visibility again
                            postUpdateCrewSection.style.display = 'block';
                            postUpdateCrewSection.style.visibility = 'visible';
                            postUpdateCrewSection.style.opacity = '1';
                        } else {
                            console.error('Crew section does not exist after UI update');
                        }
                    }, 500);
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
        console.log('Complete flow data:', JSON.stringify(flowData, null, 2));
        // Update header and description
        flowTitle.textContent = flowData.name + ' Flow';
        flowDescription.innerHTML = '<strong>Description:</strong> ' + flowData.description;
        
        // Update metrics
        agentsCount.textContent = flowData.metrics.agents;
        tasksCount.textContent = flowData.metrics.tasks;
        avgCompletionTime.textContent = flowData.metrics.avgCompletionTime;
        successRate.textContent = flowData.metrics.successRate;
        
        // Update crew information if available
        const crewSection = document.getElementById('crew-section');
        const crewInfo = document.getElementById('crew-info');
        
        console.log('DOM elements:', { crewSection, crewInfo });
        console.log('Flow data received:', flowData);
        console.log('Crew information:', flowData.crew);
        
        // Check if crew section exists in DOM
        if (!crewSection) {
            console.error('Crew section element not found in DOM');
        }
        
        if (!crewInfo) {
            console.error('Crew info element not found in DOM');
        }
        
        if (flowData.crew) {
            console.log('Crew found, displaying crew information');
            
            if (crewSection) {
                crewSection.style.display = 'block';
                console.log('Set crew section display to block');
                // Force a reflow to ensure the section is visible
                setTimeout(() => {
                    console.log('Crew section computed style:', window.getComputedStyle(crewSection).display);
                    console.log('Crew section visibility:', window.getComputedStyle(crewSection).visibility);
                    console.log('Crew section dimensions:', {
                        width: crewSection.offsetWidth,
                        height: crewSection.offsetHeight,
                        clientWidth: crewSection.clientWidth,
                        clientHeight: crewSection.clientHeight
                    });
                }, 100);
            }
            
            if (crewInfo) {
                try {
                    console.log('Rendering crew info with:', {
                        name: flowData.crew.name,
                        description: flowData.crew.description,
                        agents: flowData.crew.agents
                    });
                    
                    let agentsHtml = '';
                    if (flowData.crew.agents && Array.isArray(flowData.crew.agents)) {
                        agentsHtml = flowData.crew.agents.map(agent => {
                            console.log('Processing agent:', agent);
                            let iconClass = 'fa-user';
                            if (agent.name && typeof agent.name === 'string') {
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
                            }
                            
                            return `
                                <div class="crew-agent-item">
                                    <h5><i class="fa-solid ${iconClass}"></i> ${agent.name || 'Unknown Agent'}</h5>
                                    <p>${agent.description || 'No description available'}</p>
                                    <span class="crew-agent-role">${agent.role || 'Unknown Role'}</span>
                                </div>
                            `;
                        }).join('');
                    } else {
                        console.warn('No agents array found in crew or agents is not an array:', flowData.crew.agents);
                        agentsHtml = '<p>No agents found in this crew.</p>';
                    }
                    
                    crewInfo.innerHTML = `
                        <h4>${flowData.crew.name || 'Unnamed Crew'}</h4>
                        <p>${flowData.crew.description || 'No description available'}</p>
                        <div class="crew-agents">
                            <h5>Crew Agents:</h5>
                            ${agentsHtml}
                        </div>
                    `;
                } catch (error) {
                    console.error('Error rendering crew information:', error);
                    crewInfo.innerHTML = `
                        <div class="error">
                            <p>Error displaying crew information: ${error.message}</p>
                            <pre>${JSON.stringify(flowData.crew, null, 2)}</pre>
                        </div>
                    `;
                }
            }
        } else {
            console.log('No crew found in flow data, adding placeholder');
            
            // Add a placeholder crew for debugging
            if (crewSection) {
                crewSection.style.display = 'block';
                console.log('Set crew section display to block (in else branch)');
                // Force a reflow to ensure the section is visible
                setTimeout(() => {
                    console.log('Crew section computed style (else):', window.getComputedStyle(crewSection).display);
                    console.log('Crew section visibility (else):', window.getComputedStyle(crewSection).visibility);
                    console.log('Crew section dimensions (else):', {
                        width: crewSection.offsetWidth,
                        height: crewSection.offsetHeight,
                        clientWidth: crewSection.clientWidth,
                        clientHeight: crewSection.clientHeight
                    });
                }, 100);
            }
            
            if (crewInfo) {
                crewInfo.innerHTML = `
                    <div class="debug-info">
                        <h4>Debug Information</h4>
                        <p>No crew information was found in the flow data.</p>
                        <p>Flow data keys: ${Object.keys(flowData).join(', ')}</p>
                    </div>
                `;
            }
        }
        
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
