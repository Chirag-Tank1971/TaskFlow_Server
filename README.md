# 🗂️ Task Manager

A full-stack Task Manager application for managing and assigning tasks efficiently. Built with the MERN stack (MongoDB, Express.js, React.js, Node.js), it supports role-based login, CSV-based task imports, protected routes, and a responsive user interface.

---

---


## 🚀 Features

- ✅ **Role-Based Login System** (Admin, Agent)
- 🔐 **Protected Routes** using JWT
- 📥 Upload tasks via CSV
- ⚡ Auto-distribute tasks to available agents
- 🧾 Real-time task list with status tracking
- ✏️ Edit/Delete tasks
- 🌐 API with Express.js + MongoDB
- 🎨 Clean UI with React and Tailwind CSS

---

## 🔐 Authentication & Authorization

- **JWT-based authentication**
- **Admin** can:
  - Upload CSV
  - Assign tasks
  - Manage users
- **Agent** can:
  - View their assigned tasks
  - Update task status

---

## 🛠️ Tech Stack

| Layer       | Tech Stack                       |
|-------------|----------------------------------|
| Frontend    | React.js, Tailwind CSS, Axios    |
| Backend     | Node.js, Express.js, JWT         |
| Auth        | Role-based JWT auth (Admin/Agent)|
| Database    | MongoDB + Mongoose               |
| File Upload | Multer / Papaparse (CSV parsing) |

---

## 📂 Project Structure

```
mern_project/

     Server/
            ├── config/             # Mongo Db connection handler
            ├── controllers/        # Route handlers (business logic)
            ├── middleware/         # Authentication middleware
            ├── models/             # Mongoose models (User, Agent, Task)
            ├── routes/             # Express route definitions
            ├── utils/              # Helper utilities (multer config)
            ├── .env                # Environment variables
            ├── script.js           # Main server entry point

```
## 🔧 Installation & Setup

### Backend Setup

1. **Clone the Repository**
   ```sh
   git clone https://github.com/your-username/task-management-system.git
   cd task-management-system/backend
   ```

2. **Install Dependencies**
   ```sh
   npm install 
   ```

3. **Set Up Environment Variables**
   Create a `.env` file and add the following:
   ```env
   MONGO_URL=your_mongodb_connection_string
   JWT_SECRET=your_secret_key
   ```

4. **Run the Server**
   ```sh
   npm start
   ```
   The backend will start on `http://localhost:5000`
## 📌 API Endpoints

### **Authentication**
- `POST /api/login` - Login and get a JWT token.

### **Agent Management**
- `POST /api/agents` - Add a new agent.
- `GET /api/agents` - Get all agents.
- `DELETE /api/agents/:id` - Delete an agent and associated tasks.

### **Task Management**
- `GET /api/tasks` - Get all tasks.
- `GET /api/tasks/:agentId` - Get tasks assigned to a specific agent.
- `POST /api/upload` - Upload a CSV file and distribute tasks.

## ✅ Usage Guide

- Authenticate using `/api/login` to obtain a JWT token.
- Use the token in the `Authorization` header (`Bearer your_token`) for API requests.
- Add agents before uploading tasks.
- Ensure CSV files include headers: `FirstName, Phone, Notes`.
- Use the React frontend for easy management.

### 🔗 Connect with Me

If you have any questions or suggestions, feel free to reach out!

GitHub: [Chirag-Tank1971](https://github.com/Chirag-Tank1971)
Email: chiragtank1971@gmail.com

