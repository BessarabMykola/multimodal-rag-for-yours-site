@echo off
echo Building Docker images and starting containers...

REM
docker-compose up --build -d

IF %ERRORLEVEL% NEQ 0 (
    echo Error starting the project.
) ELSE (
    echo Project started successfully!
    echo Frontend available at: http://localhost:5137
    echo Backend available at: http://localhost:3000
    echo To stop the project, run: docker-compose down
)

pause