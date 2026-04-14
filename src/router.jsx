import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { BookingLayout } from './layouts/BookingLayout'
import { AdminLayout } from './layouts/AdminLayout'

// Booking pages
import { HomePage }        from './pages/booking/HomePage'
import { BookAll }         from './pages/booking/BookAll'
import { SelectService }   from './pages/booking/SelectService'
import { SelectStaff }     from './pages/booking/SelectStaff'
import { SelectDateTime }  from './pages/booking/SelectDateTime'
import { CustomerDetails } from './pages/booking/CustomerDetails'
import { Confirmation }    from './pages/booking/Confirmation'

// Customer
import { MyAppointments } from './pages/customer/MyAppointments'

// Auth
import { Login }    from './pages/auth/Login'
import { Register } from './pages/auth/Register'

// Admin
import { Dashboard }    from './pages/admin/Dashboard'
import { Appointments } from './pages/admin/Appointments'
import { Staff }        from './pages/admin/Staff'
import { Services }     from './pages/admin/Services'
import { Products }     from './pages/admin/Products'
import { Settings }     from './pages/admin/Settings'
import { Invoices }     from './pages/admin/Invoices'
import { Appearance }   from './pages/admin/Appearance'
import { Messages }     from './pages/admin/Messages'
import { Branches }        from './pages/admin/Branches'
import { Customers }       from './pages/admin/Customers'
import { Waitlist }        from './pages/admin/Waitlist'
import { WaitlistConfirm } from './pages/booking/WaitlistConfirm'
import { SelectBranch }    from './pages/booking/SelectBranch'
import { PrivacyPolicy }   from './pages/PrivacyPolicy'

const router = createBrowserRouter([
  {
    path: '/',
    element: <BookingLayout><HomePage /></BookingLayout>,
  },
  {
    path: '/login',
    element: <BookingLayout><Login /></BookingLayout>,
  },
  {
    path: '/register',
    element: <BookingLayout><Register /></BookingLayout>,
  },
  {
    path: '/my-appointments',
    element: <BookingLayout><MyAppointments /></BookingLayout>,
  },
  {
    path: '/book',
    element: <Navigate to="/book/branch" replace />,
  },
  {
    path: '/book/branch',
    element: <BookingLayout><SelectBranch /></BookingLayout>,
  },
  {
    path: '/book/all',
    element: <BookingLayout><BookAll /></BookingLayout>,
  },
  {
    path: '/book/service',
    element: <BookingLayout><SelectService /></BookingLayout>,
  },
  {
    path: '/book/staff',
    element: <BookingLayout><SelectStaff /></BookingLayout>,
  },
  {
    path: '/book/datetime',
    element: <BookingLayout><SelectDateTime /></BookingLayout>,
  },
  {
    path: '/book/details',
    element: <BookingLayout><CustomerDetails /></BookingLayout>,
  },
  {
    path: '/book/confirm',
    element: <BookingLayout><Confirmation /></BookingLayout>,
  },
  // Admin
  {
    path: '/admin',
    element: <AdminLayout><Dashboard /></AdminLayout>,
  },
  {
    path: '/admin/appointments',
    element: <AdminLayout><Appointments /></AdminLayout>,
  },
  {
    path: '/admin/staff',
    element: <AdminLayout><Staff /></AdminLayout>,
  },
  {
    path: '/admin/services',
    element: <AdminLayout><Services /></AdminLayout>,
  },
  {
    path: '/admin/products',
    element: <AdminLayout><Products /></AdminLayout>,
  },
  {
    path: '/admin/settings',
    element: <AdminLayout><Settings /></AdminLayout>,
  },
  {
    path: '/admin/invoices',
    element: <AdminLayout><Invoices /></AdminLayout>,
  },
  {
    path: '/admin/appearance',
    element: <AdminLayout><Appearance /></AdminLayout>,
  },
  {
    path: '/admin/messages',
    element: <AdminLayout><Messages /></AdminLayout>,
  },
  {
    path: '/admin/branches',
    element: <AdminLayout><Branches /></AdminLayout>,
  },
  {
    path: '/admin/customers',
    element: <AdminLayout><Customers /></AdminLayout>,
  },
  {
    path: '/admin/waitlist',
    element: <AdminLayout><Waitlist /></AdminLayout>,
  },
  {
    path: '/waitlist/confirm',
    element: <BookingLayout><WaitlistConfirm /></BookingLayout>,
  },
  {
    path: '/privacy',
    element: <PrivacyPolicy />,
  },
  {
    path: '*',
    element: <BookingLayout>
      <div className="min-h-screen pt-32 text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-muted mb-6">הדף לא נמצא</p>
        <a href="/" className="btn-primary inline-flex">חזרה לדף הבית</a>
      </div>
    </BookingLayout>,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
