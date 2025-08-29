;; ComplaintLogger.clar
;; Logs complaints for devices, supporting virtual and in-person types.
;; Sophisticated features: complaint categories, evidence hash (IPFS), multiple complaints per user,
;; validation against ownership history, and escalation mechanism.
(use-trait device-trait .DeviceRegistry.device-trait)
(use-trait ownership-trait .OwnershipTracker.ownership-trait) ;; Assume trait defined similarly

;; Constants
(define-constant ERR-NOT-REGISTERED u20)
(define-constant ERR-NOT-AUTHORIZED u21)
(define-constant ERR-INVALID-TYPE u22)
(define-constant ERR-INVALID-DESCRIPTION u23)
(define-constant ERR-INVALID-EVIDENCE u24)
(define-constant MAX-DESCRIPTION-LEN u512)
(define-constant MAX-EVIDENCE-LEN u46) ;; IPFS hash

;; Data Maps
(define-map complaints
  { device-id: (buff 32), complaint-id: uint }
  {
    complainant: principal,
    timestamp: uint,
    complaint-type: uint, ;; e.g., 1=defect, 2=malfunction
    description: (string-ascii 512),
    is-in-person: bool,
    evidence-hash: (optional (string-ascii 46)),
    escalated: bool
  }
)
(define-map complaint-counter
  { device-id: (buff 32) }
  { count: uint }
)

;; Public Functions
(define-public (log-complaint (device-id (buff 32)) (complaint-type uint) (description (string-ascii 512)) (is-in-person bool) (evidence-hash (optional (string-ascii 46))) (registry <device-trait>) (ownership <ownership-trait>))
  (let
    (
      (is-registered (unwrap! (contract-call? registry is-registered device-id) (err ERR-NOT-REGISTERED)))
      (current-owner (unwrap! (contract-call? ownership get-current-owner device-id) (err ERR-NOT-REGISTERED)))
    )
    (asserts! is-registered (err ERR-NOT-REGISTERED))
    (asserts! (is-eq tx-sender current-owner) (err ERR-NOT-AUTHORIZED)) ;; Restrict to current owner
    (asserts! (> complaint-type u0) (err ERR-INVALID-TYPE))
    (asserts! (<= (len description) MAX-DESCRIPTION-LEN) (err ERR-INVALID-DESCRIPTION))
    (match evidence-hash hash
      (asserts! (and (<= (len hash) MAX-EVIDENCE-LEN) (is-eq (slice? hash u0 u2) "Qm")) (err ERR-INVALID-EVIDENCE)) ;; Validate IPFS hash
      true
    )
    (let
      (
        (counter (default-to {count: u0} (map-get? complaint-counter {device-id: device-id})))
        (new-id (get count counter))
      )
      (map-set complaints
        {device-id: device-id, complaint-id: new-id}
        {
          complainant: tx-sender,
          timestamp: block-height,
          complaint-type: complaint-type,
          description: description,
          is-in-person: is-in-person,
          evidence-hash: evidence-hash,
          escalated: false
        }
      )
      (map-set complaint-counter {device-id: device-id} {count: (+ new-id u1)})
      (print {event: "complaint-logged", device-id: device-id, complaint-id: new-id})
      (ok true)
    )
  )
)

(define-public (escalate-complaint (device-id (buff 32)) (complaint-id uint))
  (let
    (
      (complaint (unwrap! (map-get? complaints {device-id: device-id, complaint-id: complaint-id}) (err ERR-NOT-REGISTERED)))
    )
    (asserts! (is-eq (get complainant complaint) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get escalated complaint)) (err ERR-INVALID-TYPE))
    (map-set complaints {device-id: device-id, complaint-id: complaint-id} (merge complaint {escalated: true}))
    (print {event: "complaint-escalated", device-id: device-id, complaint-id: complaint-id})
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-complaint (device-id (buff 32)) (complaint-id uint))
  (ok (unwrap! (map-get? complaints {device-id: device-id, complaint-id: complaint-id}) (err ERR-NOT-REGISTERED)))
)

(define-read-only (get-complaint-count (device-id (buff 32)))
  (ok (get count (default-to {count: u0} (map-get? complaint-counter {device-id: device-id}))))
)

(define-read-only (is-escalated (device-id (buff 32)) (complaint-id uint))
  (let
    (
      (complaint (unwrap! (map-get? complaints {device-id: device-id, complaint-id: complaint-id}) (err ERR-NOT-REGISTERED)))
    )
    (ok (get escalated complaint))
  )
)