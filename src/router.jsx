import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { BookingLayout } from './layouts/BookingLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { PageSpinner } from './components/ui/Spinner'
import { AdminSkeleton } from './components/feedback/AdminSkeleton'

// Booking pages — HomePage is NOT lazy so landing page loads fast
import { HomePage } from './pages/booking/HomePage'

// Booking flow — lazy-loaded so framer-motion stays out of the landing critical path
const ProductsPage    = lazy(() => import('./pages/booking/ProductsPage').then(m => ({ default: m.ProductsPage })))
const BookAll         = lazy(() => import('./pages/booking/BookAll').then(m => ({ default: m.BookAll })))
const SelectBranch    = lazy(() => import('./pages/booking/SelectBranch').then(m => ({ default: m.SelectBranch })))
const SelectService   = lazy(() => import('./pages/booking/SelectService').then(m => ({ default: m.SelectService })))
const SelectStaff     = lazy(() => import('./pages/booking/SelectStaff').then(m => ({ default: m.SelectStaff })))
const SelectDateTime  = lazy(() => import('./pages/booking/SelectDateTime').then(m => ({ default: m.SelectDateTime })))
const CustomerDetails = lazy(() => import('./pages/booking/CustomerDetails').then(m => ({ default: m.CustomerDetails })))
const Confirmation    = lazy(() => import('./pages/booking/Confirmation').then(m => ({ default: m.Confirmation })))
const Payment         = lazy(() => import('./pages/booking/Payment').then(m => ({ default: m.Payment })))
const WaitlistConfirm  = lazy(() => import('./pages/booking/WaitlistConfirm').then(m => ({ default: m.WaitlistConfirm })))
const RescheduleConfirm = lazy(() => import('./pages/booking/RescheduleConfirm').then(m => ({ default: m.RescheduleConfirm })))

// Auth — lazy so login code doesn't ship on landing
const Login    = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })))
const Register = lazy(() => import('./pages/auth/Register').then(m => ({ default: m.Register })))

// Customer
const MyAppointments = lazy(() => import('./pages/customer/MyAppointments').then(m => ({ default: m.MyAppointments })))
const Team            = lazy(() => import('./pages/booking/Team'))
const StaffProfile    = lazy(() => import('./pages/booking/StaffProfile'))
const BookCinematic   = lazy(() => import('./pages/booking/BookCinematic'))

// Static
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
const InvoiceView = lazy(() => import('./pages/InvoiceView').then(m => ({ default: m.InvoiceView })))

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
      <Suspense fallback={<AdminSkeleton />}>
        {children}
      </Suspense>
    </AdminLayout>
  )
}

// Wrap lazy booking/auth pages in Suspense
function BookingRoute({ children }) {
  return (
    <BookingLayout>
      <Suspense fallback={<PageSpinner />}>
        {children}
      </Suspense>
    </BookingLayout>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <BookingLayout><HomePage /></BookingLayout>,
  },
  {
    path: '/login',
    element: <BookingRoute><Login /></BookingRoute>,
  },
  {
    path: '/register',
    element: <BookingRoute><Register /></BookingRoute>,
  },
  {
    path: '/my-appointments',
    element: <BookingRoute><MyAppointments /></BookingRoute>,
  },
  {
    path: '/products',
    element: <BookingRoute><ProductsPage /></BookingRoute>,
  },
  {
    path: '/book/cinematic',
    element: <BookingRoute><BookCinematic /></BookingRoute>,
  },
  {
    path: '/team',
    element: <BookingRoute><Team /></BookingRoute>,
  },
  {
    path: '/team/:staffId',
    element: <BookingRoute><StaffProfile /></BookingRoute>,
  },
  {
    path: '/book',
    element: <Navigate to="/book/branch" replace />,
  },
  {
    path: '/book/branch',
    element: <BookingRoute><SelectBranch /></BookingRoute>,
  },
  {
    path: '/book/all',
    element: <BookingRoute><BookAll /></BookingRoute>,
  },
  {
    path: '/book/service',
    element: <BookingRoute><SelectService /></BookingRoute>,
  },
  {
    path: '/book/staff',
    element: <BookingRoute><SelectStaff /></BookingRoute>,
  },
  {
    path: '/book/datetime',
    element: <BookingRoute><SelectDateTime /></BookingRoute>,
  },
  {
    path: '/book/details',
    element: <BookingRoute><CustomerDetails /></BookingRoute>,
  },
  {
    path: '/book/payment',
    element: <BookingRoute><Payment /></BookingRoute>,
  },
  {
    path: '/book/confirm',
    element: <BookingRoute><Confirmation /></BookingRoute>,
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
    element: <BookingRoute><WaitlistConfirm /></BookingRoute>,
  },
  {
    path: '/reschedule/confirm',
    element: <BookingRoute><RescheduleConfirm /></BookingRoute>,
  },
  {
    path: '/invoice/:id',
    element: <Suspense fallback={<PageSpinner />}><InvoiceView /></Suspense>,
  },
  {
    path: '/privacy',
    element: <PrivacyPolicy />,
  },
  {
    path: '/terms',
    element: <TermsOfService />,
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
