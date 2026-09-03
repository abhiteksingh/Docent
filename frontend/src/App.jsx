import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'

import GeneralWorkspace from "./workspaces/general/GeneralWorkspace"
import ContractAuditorWorkspace from "./workspaces/contract-auditor/ContractAuditorWorkspace"
import SpacedLearningWorkspace from "./workspaces/spaced-learning/SpacedLearningWorkspace"
import SpreadsheetAnalyticsWorkspace from "./workspaces/spreadsheet-analytics/SpreadsheetAnalyticsWorkspace"
import InterviewSimulatorWorkspace from "./workspaces/interview-simulator/InterviewSimulatorWorkspace"
import LandingPage from "./components/LandingPage"
import { ROUTES } from "./routes"
import API_BASE from "./api"

function App() {
  const [messages, setMessages] = useState([])
  const [chatId, setChatId] = useState("")
  const [chats, setChats] = useState([])

  const navigate = useNavigate()
  const location = useLocation()

  const navigateTo = (route) => navigate(route.path)

  // Reset workspace state on route change to maintain strict workspace isolation
  useEffect(() => {
    setChatId("")
    setMessages([])
    setChats([])
  }, [location.pathname])

  // Poll for updates if any chat is still processing in the background
  useEffect(() => {
    const hasProcessing = chats.some(c => c.status === "processing")
    if (!hasProcessing) return

    const currentRoute = Object.values(ROUTES).find(r => r.path === location.pathname)
    const wType = (currentRoute && currentRoute.name !== ROUTES.LANDING.name) ? currentRoute.name : ""
    const queryParam = wType ? `?workspace_type=${wType}` : ""

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/chats${queryParam}`)
        if (response.ok) {
          const data = await response.json()
          setChats(data.chats)
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [chats, location.pathname])

  const workspaceProps = {
    chatId,
    setChatId,
    messages,
    setMessages,
    chats,
    setChats,
    onNavigateHome: () => navigateTo(ROUTES.LANDING),
  }

  const landing = <LandingPage onStartChat={(route) => navigateTo(route || ROUTES.CHAT)} />

  return (
    <Routes>
      <Route path={ROUTES.LANDING.path} element={landing} />
      <Route
        path={ROUTES.CHAT.path}
        element={
          <div className="h-screen flex bg-[#0B0E14] text-[#DDE6ED] font-sans overflow-hidden" data-workspace={ROUTES.CHAT.name}>
            <div className="flex-1 min-w-0 h-screen">
              <GeneralWorkspace {...workspaceProps} workspaceType={ROUTES.CHAT.name} />
            </div>
          </div>
        }
      />
      <Route
        path={ROUTES.AUDITOR.path}
        element={
          <div className="h-screen flex bg-[#0B0E14] text-[#DDE6ED] font-sans overflow-hidden" data-workspace={ROUTES.AUDITOR.name}>
            <div className="flex-1 min-w-0 h-screen">
              <ContractAuditorWorkspace {...workspaceProps} workspaceType={ROUTES.AUDITOR.name} />
            </div>
          </div>
        }
      />
      <Route
        path={ROUTES.LEARNING.path}
        element={
          <div className="h-screen flex bg-[#0B0E14] text-[#DDE6ED] font-sans overflow-hidden" data-workspace={ROUTES.LEARNING.name}>
            <div className="flex-1 min-w-0 h-screen">
              <SpacedLearningWorkspace {...workspaceProps} workspaceType={ROUTES.LEARNING.name} />
            </div>
          </div>
        }
      />
      <Route
        path={ROUTES.ANALYTICS.path}
        element={
          <div className="h-screen flex bg-[#0B0E14] text-[#DDE6ED] font-sans overflow-hidden" data-workspace={ROUTES.ANALYTICS.name}>
            <div className="flex-1 min-w-0 h-screen">
              <SpreadsheetAnalyticsWorkspace {...workspaceProps} workspaceType={ROUTES.ANALYTICS.name} />
            </div>
          </div>
        }
      />
      <Route
        path={ROUTES.SIMULATOR.path}
        element={
          <div className="h-screen flex bg-[#0B0E14] text-[#DDE6ED] font-sans overflow-hidden" data-workspace={ROUTES.SIMULATOR.name}>
            <div className="flex-1 min-w-0 h-screen">
              <InterviewSimulatorWorkspace {...workspaceProps} workspaceType={ROUTES.SIMULATOR.name} />
            </div>
          </div>
        }
      />
      <Route path="*" element={landing} />
    </Routes>
  )
}

export default App;
