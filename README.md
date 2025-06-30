# Multimodal RAG Project

## Requirements

* **Docker Desktop** (includes Docker Engine and Docker Compose)

## Setup and Running the Project

### Step 1: Configure Environment Variables (`.env` files)

1.  **Backend Configuration:**
    * Navigate to the `Backend/` directory.
    * Create a `.env` file from `.env.example`:
        ```bash
        cp Backend/.env.example Backend/.env
        ```
    * **Edit `Backend/.env`** and set your OpenAI API Key:
        ```env
        # Backend/.env
        OPENAI_API_KEY="YOUR_PERSONAL_OPENAI_API_KEY"
        ```
        **Important:** Do not commit this file to version control.

2.  **Frontend Configuration (if applicable):**
    * If `Frontend/.env.example` exists, create its `.env` counterpart:
        ```bash
        cp Frontend/.env.example Frontend/.env
        ```
    * Modify `Frontend/.env` as needed.

### Step 2: Run the Application

Execute the appropriate script from the project's root directory (`multy-modal-rag/`):

#### For Windows users:

```bash
start.bat
```

#### For Linux/macOS users:
First, make the script executable:

```bash
chmod +x start.sh
```

Then, run it:

```bash
./start.sh
```

These scripts will build the necessary Docker images and start all project services.
