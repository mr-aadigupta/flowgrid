@echo off
echo =========================================
echo       Starting FLOWGRID Servers...
echo =========================================

:: Start the Backend AND Reset the Database
echo Resetting Database and Starting FastAPI Backend...
start "FLOWGRID Backend" cmd /k "cd backend && venv\Scripts\activate.bat && python database.py && uvicorn main:app --reload"

:: Start the React Frontend
echo Starting React Frontend...
start "FLOWGRID Frontend" cmd /k "cd frontend && npm start"

echo.
echo Database refreshed! Both servers are launching in separate windows.
echo You can close this window now.