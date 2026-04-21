import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {

    useEffect(() => {
        const preventZoom = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };
        document.addEventListener('wheel', preventZoom, { passive: false });
        return () => document.removeEventListener('wheel', preventZoom);
    }, []);

    return (
        <div className="lens-assembly-container">
            <Sidebar />
            <div className="lens-assembly-main">
                <Outlet />
            </div>
        </div>
    )
}