export const EVALUATION_CATEGORIES: { key: string; label: string }[] = [
  { key: "professionalManner", label: "Professional Manner" },
  { key: "communicationWithStudent", label: "Communication with Students" },
  { key: "studentEngagement", label: "Student Engagement" },
  { key: "learningMaterials", label: "Learning Materials" },
  { key: "timeManagement", label: "Time Management" },
  { key: "experientialLearning", label: "Experiential Learning Provided to Students" },
  { key: "respectUniqueness", label: "Respect the Uniqueness of the Students" },
  { key: "assessmentAndFeedback", label: "Assessment and Feedback" },
]

// Coverage buckets for the admin evaluation-status report (client-safe,
// no server imports — safe to import from "use client" components).
export const STATUS_ON_TRACK_PCT = 70
