import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ModelLibrary from './pages/ModelLibrary'
import LogAnalyzer from './pages/LogAnalyzer'
import PCDetailsPage from './pages/MCDetails'
import ModelEditor from './pages/ModelEditor' // Ensure this is imported
import NotFound from './pages/NotFound'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
    // Define router with Data Router API to enable useBlocker
    const router = createBrowserRouter([
        {
            path: "/",
            element: <Layout />,
            children: [
                { index: true, element: <Navigate to="/dashboard" replace /> },
                { path: "dashboard", element: <Dashboard /> },
                { path: "dashboard/:version", element: <Dashboard /> },
                { path: "pc/:id", element: <PCDetailsPage /> },
                { path: "models", element: <ModelLibrary /> },
                { path: "models/edit/:id", element: <ModelEditor /> }, // Editor Route
                { path: "log-analyzer", element: <LogAnalyzer /> },
            ]
        },
        {
            path: "*",
            element: <NotFound />
        }
    ])

    return (
        <ThemeProvider>
            <RouterProvider router={router} />
        </ThemeProvider>
    )
}

export default App