import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { BookingLayout } from './layouts/BookingLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { PageSpinner } from './components/ui/Spinner'

// Booking pages
import { HomePage }        from './pages/booking/HomePage'
import { BookAll }         from './pages/booking/BookAll'
import { SelectService }   from './pages/booking/SelectService'
import { SelectStaff }     from './pages/booking/SelectStaff'
import { SelectDateTime }  from './pages/booking/SelectDateTime'
import { CustomerDetails } from './pages/booking/CustomerDetails'
import { Confirmation }    from './pages/booking/Confirmation'
import { Payment }         from './pages/booking/Payment'

// Customer
import { MyAppointments } from './pages/customer/MyAppointments'

// Auth
import { Login }    from './pages/auth/Login'
import { Register } from './pages/auth/Register'

import { WaitlistConfirm } from './pages/booking/WaitlistConfirm'
import { RescheduleConfirm } from './pages/booking/RescheduleConfirm'
import { SelectBranch }    from './pages/booking/SelectBranch'
import { PrivacyPolicy }   from './pages/PrivacyPolicy'

// Admin — code-split so the ~544KB admin bundle (Appointments etc.)
// doesn't ship to unauth visitors on the landing page.
const Dashboard    = lazy(() => import('./pages/admin/Dashboard').then(m => ({ default: m.Dashboard })))
const Appointments = lazy(() => import('./pages/admin/Appointments').then(m => ({ default: m.Appointments })))
const Staff        = lazy(() => import('./pages/admin/Staff').then(m => ({ default: m.Staff })))
const Services     = lazy(() => import('./pages/admin/Services').then(m => ({ default: m.Services })))
const Products     = lazy(() => import('./pages/admin/Products').then(m => ({ default: m.Products })))
const Settings     = lazy(() => import('./pages/admin/Settings').then(m => ({ default: m.Settings })))
const Appearance   = lazy(() => import('./pages/admin/Appearance').then(m => ({ default: m.Appearance })))
const Messages     = lazy(() => import('./pages/admin/Messages').then(m => ({ default: m.Messages })))
const Branches     = lazy(() => import('./pages/admin/Branches').then(m => ({ default: m.Branches })))
const Customers    = lazy(() => import('./pages/admin/Customers').then(m => ({ default: m.Customers })))
const Waitlist     = lazy(() => import('./pages/admin/Waitlist').then(m => ({ default: m.Waitlist })))
const Finance      = lazy(() => import('./pages/admin/Finance').then(m => ({ default: m.Finance })))

// Wrap admin pages in Suspense for lazy loading.
// Using a component (not a helper fn) so React can reconcile instances.
function AdminRoute({ children }) {
  return (
    <AdminLayout>
      <Suspense fallback={<PageSpinner />}>
        {children}
      </Suspense>
    </AdminLayout>
  )
}

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
    path: '/book/payment',
    element: <BookingLayout><Payment /></BookingLayout>,
  },
  {
    path: '/book/confirm',
    element: <BookingLayout><Confirmation /></BookingLayout>,
  },
  // Admin
  { path: '/admin',              element: <AdminRoute><Dashboard /></AdminRoute> },
  { path: '/admin/dashboard',    element: <Navigate to="/admin" replace /> },
  { path: '/admin/appointments', element: <AdminRoute><Appointments /></AdminRoute> },
  { path: '/admin/staff',        element: <AdminRoute><Staff /></AdminRoute> },
  { path: '/admin/services',     element: <AdminRoute><Services /></AdminRoute> },
  { path: '/admin/products',     element: <AdminRoute><Products /></AdminRoute> },
  { path: '/admin/settings',     element: <AdminRoute><Settings /></AdminRoute> },
  { path: '/admin/invoices',     element: <Navigate to="/admin/finance" replace /> },
  { path: '/admin/appearance',   element: <AdminRoute><Appearance /></AdminRoute> },
  { path: '/admin/messages',     element: <AdminRoute><Messages /></AdminRoute> },
  { path: '/admin/branches',     element: <AdminRoute><Branches /></AdminRoute> },
  { path: '/admin/customers',    element: <AdminRoute><Customers /></AdminRoute> },
  { path: '/admin/waitlist',     element: <AdminRoute><Waitlist /></AdminRoute> },
  { path: '/admin/payments',     element: <Navigate to="/admin/finance" replace /> },
  { path: '/admin/finance',      element: <AdminRoute><Finance /></AdminRoute> },
  {
    path: '/waitlist/confirm',
    element: <BookingLayout><WaitlistConfirm /></BookingLayout>,
  },
  {
    path: '/reschedule/confirm',
    element: <BookingLayout><RescheduleConfirm /></BookingLayout>,
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
