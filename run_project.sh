#!/bin/bash

echo "Building Docker images and starting containers..."

docker-compose up --build -d

if [ $? -eq 0 ]; then
    echo "Project started successfully!"
    echo "Frontend available at: http://localhost"
    echo "Backend available at: http://localhost:3000"
    echo "To stop the project, run: docker-compose down"
else
    echo "Error starting the project."
fi