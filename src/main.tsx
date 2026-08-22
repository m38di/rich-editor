import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Order matters: tokens define the variables, index.css emits Tailwind's
// layers, and the component sheets come last so they keep winning over
// single-class utilities.
import './styles/tokens.css'
import './index.css'
import './styles/shell.css'
import './styles/sheets.css'
import './styles/editor.css'
import './styles/tables.css'
import 'katex/dist/katex.min.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
