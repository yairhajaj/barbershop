# Barbershop App

Booking and management app for barbershops — customers book appointments, admins manage staff/services/invoices.

## Tech Stack

- React 19 + Vite 8
- Tailwind CSS 4 (via @tailwindcss/vite plugin)
- React Router 7 (createBrowserRouter)
- Supabase (auth + database + storage)
- Framer Motion (animations)
- @react-pdf/renderer (invoice PDF generation)
- @dnd-kit (drag and drop)
- date-fns (date formatting)
- ESLint

## Project Structure

- `src/pages/booking/` — customer booking flow (service > staff > datetime > details > confirmation)
- `src/pages/admin/` — admin panel (dashboard, appointments, staff, services, products, invoices, settings, appearance)
- `src/pages/auth/` — login/register (phone-based auth via Supabase)
- `src/pages/customer/` — customer area (my appointments)
- `src/contexts/` — AuthContext, ThemeContext, LangContext
- `src/hooks/` — data hooks (useStaff, useServices, useAppointments, useProducts, useReviews, useBusinessSettings, useBusinessGallery, useStaffPortfolio, useRecurringBreaks)
- `src/lib/` — supabase client, utils, upload helper, invoice PDF template
- `src/layouts/` — AdminLayout, BookingLayout
- `src/components/ui/` — Badge, Modal, Spinner, Toast, ImageUpload

## What Looks Ready

- Full booking flow (6 pages)
- Admin panel with 8 sections
- Auth system (phone-to-email pattern with Supabase)
- RTL/Hebrew support (invoice has `direction: 'rtl'`)
- Theme and language contexts
- PDF invoice generation
- Image upload with Supabase storage
- Drag and drop support
