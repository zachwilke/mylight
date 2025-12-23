# MyLight - Family Dashboard Application

MyLight is a modern, interactive family dashboard designed to organize your household's daily life. It features a shared calendar, chore tracking, meal planning, and family management tools, all wrapped in a beautiful, "Apple-like" interface.

![MyLight Dashboard Screen](https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1000) *(Replace with actual screenshot)*

## 🚀 Features

-   **📅 Family Calendar**: View and manage family events.
-   **🧹 Chore Chart**: Assign chores to family members, track completion with a star system, and manage daily tasks.
-   **🍽️ Meal Planner**: Plan breakfast, lunch, dinner, and snacks for the week.
-   **📝 Lists**: Manage shared grocery lists and to-do lists.
-   **👨‍👩‍👧‍👦 Profile Management**: Add family members, upload custom avatars, and customize colors.
-   **☀️ Weather Integration**: Live local weather updates based on your city.
-   **🎨 Beautiful UI**: Clean, responsive design with smooth animations and a "Blue Sky" aesthetic.

## 🛠️ Tech Stack

-   **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Lucide React
-   **Backend**: Node.js, Express
-   **Database**: SQLite (local `mylight.db`)
-   **File Storage**: Local filesystem (`uploads/` directory for avatars)

## ⚙️ Installation & Setup

Follow these steps to set up MyLight in a new environment.

### Prerequisites

-   **Node.js** (v18 or higher recommended)
-   **npm** (comes with Node.js)
-   **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/zachwilke/mylight.git
cd mylight
```

### 2. Install Dependencies

Install the packages for both the frontend and backend.

```bash
npm install
```

### 3. Start the Application

We use `concurrently` to run both the Vite frontend server and the Express backend server with a single command.

```bash
npm run dev
```

-   **Frontend**: `http://localhost:5173`
-   **Backend**: `http://localhost:3000`

The application should automatically open in your default browser.

## 📂 Project Structure

```text
mylight/
├── server/
│   ├── index.cjs       # Express server entry point
│   ├── db.cjs          # SQLite database connection and schema
│   └── uploads/        # Directory for uploaded user avatars
├── src/
│   ├── components/     # Reusable UI components (Avatar, Layout, etc.)
│   ├── features/       # Feature-specific code (Calendar, Chores, Meals, Settings)
│   ├── App.jsx         # Main application component
│   └── main.jsx        # React entry point
├── mylight.db          # SQLite database file (created on first run)
└── package.json        # Project dependencies and scripts
```

## 🛡️ Database

The application uses a local SQLite database (`mylight.db`). This file is created automatically when you start the server for the first time. It is **not** committed to Git to keep your local data private.

To reset your data, simply delete the `mylight.db` file and restart the server.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
