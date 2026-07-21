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

export interface SubmitStudentVerificationRequest {
  readonly student_document: string;
}
