\# FlowGrid



Voice-activated hospital resource coordinator. Describe an emergency by voice

or text, and FlowGrid picks a bed, specialists and equipment, then locks them.



\## Requirements

\- Python 3.10+

\- Node.js (LTS)



\## Setup

```

cd backend

python -m venv venv

.\\venv\\Scripts\\Activate.ps1

pip install -r requirements.txt



cd ..\\frontend

npm install

```



\## Run

Double-click `start.bat`. It resets the demo database, starts the backend

(http://localhost:8000) and the frontend (http://localhost:3000).



\## Notes

\- Voice input needs a browser with the Web Speech API (Chrome or Edge).

\- `start.bat` wipes and re-seeds the database on every launch.

