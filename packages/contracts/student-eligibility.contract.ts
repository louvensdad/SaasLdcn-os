// Mirrors app/schemas/student_eligibility.py exactly -- see
// app/models/student.py for why approve/reject have no HTTP surface yet.
export interface StudentVerificationView {
  readonly student_status: string;
  readonly student_document?: string | null;
  readonly student_validation_method?: string | null;
  readonly student_verified_at?: string | null;
  readonly student_expires_at?: string | null;
  readonly student_notes?: string | null;
  readonly created_at: string;
}

// Submission is a real multipart file upload (POST /billing/student/verification,
// field name "file") -- there is no JSON request body anymore. See
// student-document-upload.tsx / lib/api/student-eligibility.ts.
export const STUDENT_DOCUMENT_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
