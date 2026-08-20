interface LoginProps {
  onLogin: (user: { email: string; name: string }) => void
}

export default function Login(props: LoginProps) {
  const handleGoogleLogin = () => {
    // This will be replaced with actual OAuth flow
    // For now, redirect to backend OAuth endpoint
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/auth/google`
  }

  return (
    <div class="login-container">
      <div class="login-box">
        <h1>⛳ Golf Tee Times</h1>
        <p>Find available tee times at Southern NH courses</p>
        <button class="google-login-btn" onClick={handleGoogleLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
          Login with Gmail
        </button>
      </div>
    </div>
  )
}
