;; OwnershipTracker.clar
;; This contract tracks ownership transfers for registered devices, building on DeviceRegistry.
;; It logs historical owners, timestamps, and ensures only current owners can transfer.
;; Sophisticated features: multiple transfer logs per device, verification of registration and activity,
;; optional transfer notes, and recovery mechanism for disputed transfers.

(use-trait device-trait .DeviceRegistry.device-trait)

;; Constants
(define-constant ERR-NOT-REGISTERED u10)
(define-constant ERR-NOT-OWNER u11)
(define-constant ERR-INACTIVE-DEVICE u12)
(define-constant ERR-INVALID-NOTES u13)
(define-constant ERR-DISPUTED u14)
(define-constant MAX-NOTES-LEN u512)
(define-constant CONTRACT-OWNER tx-sender)

;; Data Maps
(define-map ownership-history
  { device-id: (buff 32) }
  (list 100 { owner: principal, transfer-time: uint, notes: (string-ascii 512) })
)

(define-map current-owner
  { device-id: (buff 32) }
  { owner: principal }
)

(define-map disputed-transfers
  { device-id: (buff 32), transfer-index: uint }
  { disputer: principal, reason: (string-ascii 256), resolved: bool }
)

;; Private Functions
(define-private (append-history (device-id (buff 32)) (new-owner principal) (notes (string-ascii 512)))
  (let
    (
      (history (default-to (list ) (map-get? ownership-history {device-id: device-id})))
    )
    (map-set ownership-history
      {device-id: device-id}
      (unwrap! (as-max-len? (append history {owner: new-owner, transfer-time: block-height, notes: notes}) u100) (err u100))
    )
    (ok true)
  )
)

;; Public Functions
(define-public (transfer-ownership (device-id (buff 32)) (new-owner principal) (notes (string-ascii 512)) (registry <device-trait>))
  (let
    (
      (device-info (unwrap! (contract-call? registry get-device-info device-id) (err ERR-NOT-REGISTERED)))
      (current (unwrap! (map-get? current-owner {device-id: device-id}) (err ERR-NOT-OWNER)))
    )
    (asserts! (get active device-info) (err ERR-INACTIVE-DEVICE))
    (asserts! (is-eq (get owner current) tx-sender) (err ERR-NOT-OWNER))
    (asserts! (<= (len notes) MAX-NOTES-LEN) (err ERR-INVALID-NOTES))
    (try! (append-history device-id new-owner notes))
    (map-set current-owner {device-id: device-id} {owner: new-owner})
    (print {event: "ownership-transferred", device-id: device-id, from: tx-sender, to: new-owner, notes: notes})
    (ok true)
  )
)

(define-public (dispute-transfer (device-id (buff 32)) (transfer-index uint) (reason (string-ascii 256)))
  (let
    (
      (history (unwrap! (map-get? ownership-history {device-id: device-id}) (err ERR-NOT-REGISTERED)))
    )
    (asserts! (< transfer-index (len history)) (err ERR-INVALID-NOTES))
    (asserts! (is-none (map-get? disputed-transfers {device-id: device-id, transfer-index: transfer-index})) (err ERR-DISPUTED))
    (map-set disputed-transfers {device-id: device-id, transfer-index: transfer-index} {disputer: tx-sender, reason: reason, resolved: false})
    (print {event: "transfer-disputed", device-id: device-id, transfer-index: transfer-index, disputer: tx-sender})
    (ok true)
  )
)

(define-public (resolve-dispute (device-id (buff 32)) (transfer-index uint) (resolve bool))
  (let
    (
      (dispute (unwrap! (map-get? disputed-transfers {device-id: device-id, transfer-index: transfer-index}) (err ERR-NOT-REGISTERED)))
    )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) (err ERR-NOT-OWNER))
    (map-set disputed-transfers {device-id: device-id, transfer-index: transfer-index} (merge dispute {resolved: resolve}))
    (print {event: "dispute-resolved", device-id: device-id, transfer-index: transfer-index, resolved: resolve})
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-ownership-history (device-id (buff 32)))
  (ok (default-to (list ) (map-get? ownership-history {device-id: device-id})))
)

(define-read-only (get-current-owner (device-id (buff 32)))
  (ok (get owner (unwrap! (map-get? current-owner {device-id: device-id}) (err ERR-NOT-REGISTERED))))
)

(define-read-only (is-disputed (device-id (buff 32)) (transfer-index uint))
  (let
    (
      (dispute (map-get? disputed-transfers {device-id: device-id, transfer-index: transfer-index}))
    )
    (ok (and (is-some dispute) (not (get resolved (unwrap-panic dispute)))))
  )
)

(define-read-only (get-transfer-count (device-id (buff 32)))
  (ok (len (default-to (list ) (map-get? ownership-history {device-id: device-id}))))
)