interface User {
  id: number;
  name: string;
  email: string;
}

interface DashboardProps {
  user: User;
  onLogout: () => void;
}
import MessageForm from "./MessageForm";

function Dashboard({ user, onLogout }: DashboardProps) {
  return (
    
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="telegram-logo">
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.5 3.5L2.8 10.7c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.5c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8l3.2-14.9c.3-1.2-.5-1.8-1.4-1.5zM9.3 13.4l9.4-5.9c.5-.3.9-.1.5.2l-7.8 7.1-.3 3.5-1.8-4.9z" fill="white"/>
  </svg>
</div>

        <button onClick={onLogout} className="logout-btn">
          Sign Out
        </button>
        
      </header>

      <main className="dashboard-content">
        <div className="welcome-card">
          <div className="avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>

          <h1>Welcome, {user.name}!</h1>

          <p>You have successfully signed in.</p>

          <div className="user-info">
            <p>
              <strong>username:</strong> {user.name}
            </p>
<div><MessageForm /></div>
          </div>

          <div className="status">
            <span className="status-dot"></span>
            
          </div>
          
        </div>
      </main>
    </div>
    
  );
}

export default Dashboard;