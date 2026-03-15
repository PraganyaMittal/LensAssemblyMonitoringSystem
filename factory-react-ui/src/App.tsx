import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ModelLibrary from './pages/ModelLibrary'
import LogAnalyzer from './pages/LogAnalyzer'
import PCDetailsPage from './pages/MCDetails'
import ModelEditor from './pages/ModelEditor' 
import NotFound from './pages/NotFound'
import UpdateManager from './pages/UpdateManager'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
    
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
                { path: "models/edit/:id", element: <ModelEditor /> }, 
                { path: "log-analyzer", element: <LogAnalyzer /> },
                { path: "updates", element: <UpdateManager /> },
            ]
        },
        {
            path: "*",
            element: <NotFound />
        }
    ], {
        future: {
            v7_relativeSplatPath: true,
            v7_fetcherPersist: true,
            v7_normalizeFormMethod: true,
            v7_partialHydration: true,
            v7_skipActionErrorRevalidation: true,
        }
    })

    return (
        <ThemeProvider>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </ThemeProvider>
    )
}

export default App