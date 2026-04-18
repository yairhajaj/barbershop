/**
 * Modal — thin adapter that delegates to BottomSheet.
 *
 * All existing call-sites continue to work without changes:
 *   import { Modal } from '../components/ui/Modal'
 *   <Modal open={open} onClose={onClose} title="..." size="md">...</Modal>
 *
 * On mobile (<640px) this now slides up as a native-feel bottom sheet.
 * On desktop (≥640px) it remains a centred dialog — identical to before.
 */
export { BottomSheet as Modal } from './BottomSheet'
