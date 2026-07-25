import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'

const WorldViewSpike = React.lazy(() => import('./prototype/WorldViewSpike.tsx'))
const rootView = window.location.pathname === '/prototype/world-views'
  ? (
      <React.Suspense fallback={<main>Loading disposable world-view prototype…</main>}>
        <WorldViewSpike />
      </React.Suspense>
    )
  : <App />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {rootView}
  </React.StrictMode>,
)
