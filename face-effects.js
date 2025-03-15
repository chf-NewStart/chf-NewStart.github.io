// Face Effects Integration - Fixed Version
document.addEventListener('DOMContentLoaded', function() {
    // Variables
    let currentEffect = null;
    let isCameraActive = false;
    let isFaceDetectionActive = false;
    let capturedPhotos = [];
    
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('effects-canvas');
    const ctx = canvas?.getContext('2d');
    const toggleCameraBtn = document.getElementById('toggle-camera');
    const capturePhotoBtn = document.getElementById('capture-photo');
    const downloadPhotoBtn = document.getElementById('download-photo');
    const statusMessage = document.getElementById('status-message');
    const loadingIndicator = document.getElementById('loading-indicator');
    const faceEffectsApp = document.getElementById('face-effects-app');
    const terminalInput = document.querySelector('#face-effects-section .input-field');
    
    // Terminal Commands
    if (terminalInput) {
        terminalInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const command = this.value.trim().toLowerCase();
                handleTerminalCommand(command);
                this.value = '';
            }
        });
    }
    
    function handleTerminalCommand(command) {
        const terminalContent = document.querySelector('#face-effects-section .terminal-content');
        const input = document.querySelector('#face-effects-section .terminal-input');
        
        // Create response element
        const response = document.createElement('div');
        response.classList.add('terminal-line');
        
        switch(command) {
            case 'start':
                response.innerHTML = `Initializing face effects application...`;
                showFaceEffectsApp();
                break;
                
            case 'help':
                response.innerHTML = `
                    <div style="color: #1db954">Available commands:</div>
                    <div>- start: Launch the face effects application</div>
                    <div>- list: Show available effects</div>
                    <div>- effect [name]: Apply specific effect (e.g., effect cyborg)</div>
                    <div>- stop: Close the application</div>
                    <div>- clear: Clear terminal</div>
                `;
                break;
                
            case 'list':
                response.innerHTML = `
                    <div style="color: #1db954">Available effects:</div>
                    <div>- cyborg: The Cyborg Effect</div>
                    <div>- gold: Midas Touch</div>
                    <div>- emotions: Emotion Visualizer</div>
                `;
                break;
                
            case 'stop':
                response.innerHTML = `Shutting down face effects application...`;
                hideFaceEffectsApp();
                break;
                
            case 'clear':
                const prompt = terminalContent.querySelector('.prompt');
                if (prompt && input) {
                    terminalContent.innerHTML = '';
                    terminalContent.appendChild(prompt);
                    terminalContent.appendChild(input);
                }
                return;
                
            default:
                if (command.startsWith('effect ')) {
                    const effectName = command.split(' ')[1].toLowerCase();
                    
                    if (['cyborg', 'gold', 'emotions'].includes(effectName)) {
                        const effectId = effectName.charAt(0).toUpperCase() + effectName.slice(1);
                        toggleFaceEffect(effectId);
                        response.innerHTML = `Applying effect: ${effectId}...`;
                    } else {
                        response.innerHTML = `Error: Effect '${effectName}' not found. Type 'list' to see available effects.`;
                    }
                } 
                else if (command === '') {
                    return;
                } 
                else {
                    response.innerHTML = `Command not found: ${command}. Type 'help' for available commands.`;
                }
        }
        
        // Insert response before the input field
        if (input) {
            terminalContent.insertBefore(response, input);
        }
        
        // Scroll to the bottom
        terminalContent.scrollTop = terminalContent.scrollHeight;
    }
    
    // Show/Hide the Face Effects App
    function showFaceEffectsApp() {
        if (faceEffectsApp) {
            faceEffectsApp.style.display = 'block';
        }
    }
    
    function hideFaceEffectsApp() {
        if (faceEffectsApp) {
            faceEffectsApp.style.display = 'none';
        }
        stopCamera();
    }
    
    // Toggle Face Effects
    window.toggleFaceEffect = function(id) {
        // Hide all effect details
        document.querySelectorAll('.project-detail').forEach(detail => {
            detail.classList.remove('active');
            detail.style.display = 'none';
        });
        
        // Show the selected effect detail
        const effectDetail = document.getElementById(id);
        if (effectDetail) {
            effectDetail.style.display = 'block';
            setTimeout(() => {
                effectDetail.classList.add('active');
            }, 10);
        }
        
        // Update current effect
        currentEffect = id.toLowerCase();
        
        // Make sure the app is visible
        showFaceEffectsApp();
        
        // Update status message
        if (statusMessage) {
            statusMessage.textContent = `Effect: ${id} ${isCameraActive ? 'active' : 'selected (start camera to apply)'}`;
        }
        
        // Update tab styles
        const effectTabs = document.querySelectorAll('#face-effects-section .project-tab');
        effectTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        
        const selectedTab = document.querySelector(`.project-btn[onclick*="'${id}'"]`)?.parentElement;
        if (selectedTab) {
            selectedTab.classList.add('active');
        }
        
        return false;
    };
    
    // Camera Control Functions
    if (toggleCameraBtn) {
        toggleCameraBtn.addEventListener('click', function() {
            if (isCameraActive) {
                stopCamera();
            } else {
                startCamera();
            }
        });
    }
    
    function startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            // Update UI
            if (toggleCameraBtn) toggleCameraBtn.textContent = "Starting...";
            if (statusMessage) statusMessage.textContent = "Requesting camera access...";
            
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function(stream) {
                    if (video) {
                        video.srcObject = stream;
                        video.onloadedmetadata = function() {
                            video.play();
                            isCameraActive = true;
                            
                            // Set canvas dimensions to match video
                            if (canvas) {
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                            }
                            
                            // Update UI
                            if (toggleCameraBtn) toggleCameraBtn.textContent = "Stop Camera";
                            if (capturePhotoBtn) capturePhotoBtn.disabled = false;
                            if (statusMessage) statusMessage.textContent = currentEffect ? 
                                `Effect: ${currentEffect} active` : "Camera active (No effect selected)";
                            
                            // Start applying effects if one is selected
                            if (currentEffect) {
                                if (currentEffect === 'emotions') {
                                    loadEmotionDetection();
                                } else {
                                    applyBasicEffect();
                                }
                            }
                        };
                    }
                })
                .catch(function(error) {
                    console.error("Error accessing camera:", error);
                    if (statusMessage) statusMessage.textContent = "Camera access denied. Please check permissions.";
                    if (toggleCameraBtn) toggleCameraBtn.textContent = "Start Camera";
                });
        } else {
            if (statusMessage) statusMessage.textContent = "Camera not supported in this browser.";
        }
    }
    
    function stopCamera() {
        if (video && video.srcObject) {
            const stream = video.srcObject;
            const tracks = stream.getTracks();
            
            tracks.forEach(function(track) {
                track.stop();
            });
            
            video.srcObject = null;
            isCameraActive = false;
            
            // Stop the face detection loop
            isFaceDetectionActive = false;
            
            // Update UI
            if (toggleCameraBtn) toggleCameraBtn.textContent = "Start Camera";
            if (capturePhotoBtn) capturePhotoBtn.disabled = true;
            if (downloadPhotoBtn) downloadPhotoBtn.disabled = true;
            if (statusMessage) statusMessage.textContent = "Camera inactive";
            
            // Clear canvas
            if (canvas && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
    
    // Basic Effects (non-facial-detection based)
    function applyBasicEffect() {
        if (!isCameraActive || !canvas || !ctx) return;
        
        isFaceDetectionActive = true;
        
        // Update UI
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        if (statusMessage) statusMessage.textContent = `Effect: ${currentEffect} active`;
        
        // Start the effect rendering loop
        requestAnimationFrame(renderBasicEffect);
    }
    
    function renderBasicEffect() {
        if (!isCameraActive || !isFaceDetectionActive || !canvas || !ctx) return;
        
        // Clear previous drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Apply effect based on current selection
        switch (currentEffect) {
            case 'cyborg':
                applyCyborgEffect();
                break;
            case 'gold':
                applyGoldEffect();
                break;
            default:
                // No effect selected
                break;
        }
        
        // Continue the loop if still active
        if (isFaceDetectionActive) {
            requestAnimationFrame(renderBasicEffect);
        }
    }
    
    // Face-api.js based emotion detection
    async function loadEmotionDetection() {
        if (!isCameraActive || isFaceDetectionActive) return;
        
        // Show loading indicator
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        if (statusMessage) statusMessage.textContent = "Loading emotion detection models...";
        
        try {
            // Try loading required models - with properly fixed paths
            // Change this in face-effects.js
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('models/tiny_face_detector_model-weights_manifest.json'),
                faceapi.nets.faceLandmark68Net.loadFromUri('models/face_landmark_68_model-weights_manifest.json'),
                faceapi.nets.faceExpressionNet.loadFromUri('models/face_expression_model-weights_manifest.json')
            ]);
            // If we reach here, models were loaded successfully
            isFaceDetectionActive = true;
            
            // Hide loading indicator
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            if (statusMessage) statusMessage.textContent = `Effect: Emotions active`;
            
            // Start emotion detection loop
            requestAnimationFrame(renderEmotionEffect);
            
        } catch (error) {
            console.error("Error loading emotion detection models:", error);
            // Fall back to a basic effect
            if (statusMessage) statusMessage.textContent = "Using simulated emotion effect (models unavailable)";
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            
            isFaceDetectionActive = true;
            requestAnimationFrame(renderBasicEmotionEffect);
        }
    }
    
    // Simplified fallback if face-api.js fails
    function renderBasicEmotionEffect() {
        if (!isCameraActive || !isFaceDetectionActive || !canvas || !ctx) return;
        
        // Clear previous drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Create a simulated emotion overlay
        const time = Date.now() / 1000;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Draw a placeholder emotion gauge
        const gaugeWidth = 150;
        const gaugeHeight = 150;
        const gaugeX = canvas.width - gaugeWidth - 20;
        const gaugeY = 20;
        
        // Draw gauge background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
        
        // Draw border
        ctx.strokeStyle = '#1db954';
        ctx.lineWidth = 2;
        ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
        
        // Draw title
        ctx.font = '14px Consolas, monospace';
        ctx.fillStyle = '#1db954';
        ctx.textAlign = 'center';
        ctx.fillText('EMOTION SIMULATION', gaugeX + gaugeWidth/2, gaugeY + 15);
        
        // Draw random emotion bars
        const emotions = [
            { name: 'Happy', value: 0.5 + 0.3 * Math.sin(time) },
            { name: 'Sad', value: 0.2 + 0.1 * Math.sin(time * 1.2) },
            { name: 'Angry', value: 0.1 + 0.05 * Math.sin(time * 0.7) },
            { name: 'Surprised', value: 0.3 + 0.2 * Math.sin(time * 1.5) }
        ];
        
        const barHeight = 15;
        const barSpacing = 20;
        
        emotions.forEach((emotion, i) => {
            const y = gaugeY + 25 + (i * barSpacing);
            
            // Draw emotion name
            ctx.font = '12px Consolas, monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(emotion.name, gaugeX + 5, y + 10);
            
            // Draw bar background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(gaugeX + 70, y, 70, barHeight);
            
            // Draw emotion value bar
            const barColor = emotion.name === 'Happy' ? '#1db954' : 
                          emotion.name === 'Sad' ? '#007acc' : 
                          emotion.name === 'Angry' ? '#ff3860' : '#ffdd57';
            
            ctx.fillStyle = barColor;
            ctx.fillRect(gaugeX + 70, y, 70 * emotion.value, barHeight);
            
            // Draw percentage
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(emotion.value * 100)}%`, gaugeX + gaugeWidth - 5, y + 10);
        });
        
        // Draw simulated face tracking box
        const boxSize = 120 + 5 * Math.sin(time * 2);
        const boxX = centerX - boxSize/2;
        const boxY = centerY - boxSize/2;
        
        ctx.strokeStyle = '#1db954';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxSize, boxSize);
        
        // Draw "primary" emotion
        const primaryIndex = Math.floor((time / 2) % 4);
        const primaryEmotion = emotions[primaryIndex].name;
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
            `Primary emotion: ${primaryEmotion}`, 
            centerX, 
            boxY + boxSize + 30
        );
        
        // Continue the loop
        if (isFaceDetectionActive) {
            requestAnimationFrame(renderBasicEmotionEffect);
        }
    }
    
    // Actual face-api.js based emotion detection
    async function renderEmotionEffect() {
        if (!isCameraActive || !isFaceDetectionActive || !canvas || !ctx) return;
        
        // Clear previous drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        try {
            // Detect faces with expressions
            const detections = await faceapi.detectAllFaces(
                video, 
                new faceapi.TinyFaceDetectorOptions()
            )
            .withFaceLandmarks()
            .withFaceExpressions();
            
            // Process each detected face
            detections.forEach(detection => {
                // Draw face detection box
                const box = detection.detection.box;
                ctx.strokeStyle = '#1db954';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                
                // Draw landmarks
                const landmarks = detection.landmarks;
                const positions = landmarks.positions;
                
                ctx.fillStyle = '#1db954';
                positions.forEach(point => {
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
                    ctx.fill();
                });
                
                // Create emotion gauge in corner
                const gaugeWidth = 150;
                const gaugeHeight = 150;
                const gaugeX = canvas.width - gaugeWidth - 20;
                const gaugeY = 20;
                
                // Draw gauge background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
                
                // Draw border
                ctx.strokeStyle = '#1db954';
                ctx.lineWidth = 2;
                ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
                
                // Draw title
                ctx.font = '14px Consolas, monospace';
                ctx.fillStyle = '#1db954';
                ctx.textAlign = 'center';
                ctx.fillText('EMOTION ANALYSIS', gaugeX + gaugeWidth/2, gaugeY + 15);
                
                // Draw emotion bars
                const emotions = [
                    { name: 'Happy', value: detection.expressions.happy },
                    { name: 'Sad', value: detection.expressions.sad },
                    { name: 'Angry', value: detection.expressions.angry },
                    { name: 'Surprised', value: detection.expressions.surprised }
                ];
                
                const barHeight = 15;
                const barSpacing = 20;
                
                emotions.forEach((emotion, i) => {
                    const y = gaugeY + 25 + (i * barSpacing);
                    
                    // Draw emotion name
                    ctx.font = '12px Consolas, monospace';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(emotion.name, gaugeX + 5, y + 10);
                    
                    // Draw bar background
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fillRect(gaugeX + 70, y, 70, barHeight);
                    
                    // Draw emotion value bar
                    const barColor = emotion.name === 'Happy' ? '#1db954' : 
                                emotion.name === 'Sad' ? '#007acc' : 
                                emotion.name === 'Angry' ? '#ff3860' : '#ffdd57';
                    
                    ctx.fillStyle = barColor;
                    ctx.fillRect(gaugeX + 70, y, 70 * emotion.value, barHeight);
                    
                    // Draw percentage
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'right';
                    ctx.fillText(`${Math.floor(emotion.value * 100)}%`, gaugeX + gaugeWidth - 5, y + 10);
                });
                
                // Get primary emotion
                const primaryEmotion = getPrimaryEmotion(detection.expressions);
                
                // Draw primary emotion text
                ctx.fillStyle = '#ffffff';
                ctx.font = '16px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.fillText(
                    `Primary emotion: ${primaryEmotion}`, 
                    box.x + box.width / 2, 
                    box.y + box.height + 30
                );
            });
            
            // Update status if no faces are detected
            if (detections.length === 0 && statusMessage) {
                statusMessage.textContent = 'No faces detected. Please position your face in view.';
            }
        } catch (error) {
            console.error("Error in emotion detection:", error);
            // Fall back to simulated effect on error
            renderBasicEmotionEffect();
            return;
        }
        
        // Continue the loop
        if (isFaceDetectionActive) {
            requestAnimationFrame(renderEmotionEffect);
        }
    }
    
    // Helper function to determine primary emotion
    function getPrimaryEmotion(expressions) {
        let maxVal = 0;
        let primary = 'neutral';
        
        for (const emotion in expressions) {
            if (expressions[emotion] > maxVal) {
                maxVal = expressions[emotion];
                primary = emotion;
            }
        }
        
        return primary.charAt(0).toUpperCase() + primary.slice(1);
    }
    
    // Individual effect implementations
    function applyCyborgEffect() {
        // This is a simplified implementation that doesn't use actual face detection
        const time = Date.now() / 1000;
        
        // Draw a futuristic HUD overlay
        ctx.strokeStyle = '#1db954';
        ctx.lineWidth = 2;
        
        // Add scanning lines
        for (let i = 0; i < 5; i++) {
            const y = (canvas.height / 6) + ((canvas.height / 3) * (Math.sin(time + i) * 0.5 + 0.5));
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // Add corner brackets
        const cornerSize = 30;
        
        // Top left
        ctx.beginPath();
        ctx.moveTo(0, cornerSize);
        ctx.lineTo(0, 0);
        ctx.lineTo(cornerSize, 0);
        ctx.stroke();
        
        // Top right
        ctx.beginPath();
        ctx.moveTo(canvas.width - cornerSize, 0);
        ctx.lineTo(canvas.width, 0);
        ctx.lineTo(canvas.width, cornerSize);
        ctx.stroke();
        
        // Bottom left
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - cornerSize);
        ctx.lineTo(0, canvas.height);
        ctx.lineTo(cornerSize, canvas.height);
        ctx.stroke();
        
        // Bottom right
        ctx.beginPath();
        ctx.moveTo(canvas.width - cornerSize, canvas.height);
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(canvas.width, canvas.height - cornerSize);
        ctx.stroke();
        
        // Add some tech data displays
        ctx.font = '14px Consolas, monospace';
        ctx.fillStyle = '#1db954';
        
        // Top data
        ctx.fillText(`SYSTEM ONLINE | FPS: ${Math.floor(Math.random() * 10) + 50}`, 10, 20);
        ctx.fillText(`TARGET LOCK: ${Math.random() > 0.5 ? 'ACTIVE' : 'SEARCHING...'}`, 10, 40);
        
        // Bottom data
        ctx.fillText(`SCAN: ${Math.floor(time * 10) % 100}%`, 10, canvas.height - 20);
        ctx.fillText(`ENV: ${Math.floor(Math.random() * 100)}°`, canvas.width - 100, 20);
        
        // Add pulsing circles around the center of the screen (simulating face detection)
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        for (let i = 0; i < 3; i++) {
            const radius = 100 + (i * 30) + (Math.sin(time * 2) * 10);
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(29, 185, 84, ${0.7 - (i * 0.2)})`;
            ctx.stroke();
        }
    }
    
    function applyGoldEffect() {
        // Simplified gold effect implementation
        
        // Create a semi-transparent golden overlay
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some random "golden" sparkles
        const time = Date.now() / 1000;
        
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 50; i++) {
            const x = canvas.width * Math.random();
            const y = canvas.height * Math.random();
            const size = 1 + Math.random() * 3;
            
            // Only draw some sparkles each frame to create twinkling effect
            if (Math.sin(time * 5 + i) > 0.7) {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Add a subtle golden frame
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(255, 223, 0, 0.8)');
        gradient.addColorStop(0.5, 'rgba(212, 175, 55, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0.8)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
        
        // Add a message
        ctx.font = 'bold 20px Consolas, monospace';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText('The Midas Touch', canvas.width / 2, 30);
        ctx.font = '16px Consolas, monospace';
        ctx.fillText('Everything you touch turns to gold', canvas.width / 2, 55);
    }
    
    // Photo Capture
    if (capturePhotoBtn) {
        capturePhotoBtn.addEventListener('click', capturePhoto);
    }
    
    function capturePhoto() {
        if (!isCameraActive || !canvas || !ctx) return;
        
        // Create a new canvas to capture the photo with effects
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = canvas.width;
        captureCanvas.height = canvas.height;
        const captureCtx = captureCanvas.getContext('2d');
        
        // Draw the video frame
        captureCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Also apply the current effects from our effects canvas
        captureCtx.drawImage(canvas, 0, 0);
        
        // Convert to data URL
        const photoDataUrl = captureCanvas.toDataURL('image/png');
        
        // Add to captured photos
        capturedPhotos.unshift(photoDataUrl);
        
        // Enable download button
        if (downloadPhotoBtn) {
            downloadPhotoBtn.disabled = false;
        }
        
        // Update status
        if (statusMessage) {
            statusMessage.textContent = "Photo captured! Click Download to save.";
            setTimeout(() => {
                statusMessage.textContent = currentEffect ? 
                    `Effect: ${currentEffect} active` : "Camera active (No effect selected)";
            }, 2000);
        }
    }
    
    // Download captured photo
    if (downloadPhotoBtn) {
        downloadPhotoBtn.addEventListener('click', downloadPhoto);
    }
    
    function downloadPhoto() {
        if (capturedPhotos.length === 0) return;
        
        const a = document.createElement('a');
        a.href = capturedPhotos[0];
        a.download = `face-effect-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    // Initialize if camera buttons exist
    if (toggleCameraBtn) {
        console.log("Face Effects module initialized");
    }
});