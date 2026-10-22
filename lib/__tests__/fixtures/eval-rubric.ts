/**
 * The app's rubric, as the export shows it.
 *
 * The texts are the LIVE ones - the seed's, corrected by migrations 28/29 - not the
 * legacy workbook's wording (which still has "a good sence of humor" and
 * "COMMUNICATION WITH STUDENT"). The form says what the students rated.
 *
 * Extracted from supabase-schema.sql; the order is the rubric's displayOrder.
 */
export interface RubricStatement {
  id: string
  text: string
}

export interface RubricCriterion {
  name: string
  displayOrder: number
  statements: RubricStatement[]
}

export const APP_RUBRIC: RubricCriterion[] = [
  {
    name: "Professional Manner",
    displayOrder: 1,
    statements: [
      { id: "e0000001-0000-0000-0000-000000000001", text: "The professor has always dressed appropriately and is well groomed." },
      { id: "e0000001-0000-0000-0000-000000000002", text: "He/she behaves appropriately at all times." },
      { id: "e0000001-0000-0000-0000-000000000003", text: "He/she shows composure, exude confidence, and displays a good sense of humor." },
    ],
  },
  {
    name: "Communication with Students",
    displayOrder: 2,
    statements: [
      { id: "e0000002-0000-0000-0000-000000000001", text: "The professors appropriately/immediately responds when students communicate (timely response to the students)." },
      { id: "e0000002-0000-0000-0000-000000000002", text: "He/she gives positive and specific feedback to students, which reinforces behaviour and helps them understand how to improve and makes progress." },
      { id: "e0000002-0000-0000-0000-000000000003", text: "He/she guides the direction of the discussion." },
      { id: "e0000002-0000-0000-0000-000000000004", text: "He/she specifies how learning tasks will be evaluated (if appropriate)." },
      { id: "e0000002-0000-0000-0000-000000000005", text: "He/she seeks feedback from students on lesson and on ease of online technology and accessibility of course." },
      { id: "e0000002-0000-0000-0000-000000000006", text: "He/she shows good subject knowledge and understanding which engages students' creativity and sense of humor during the discussion." },
    ],
  },
  {
    name: "Student Engagement",
    displayOrder: 3,
    statements: [
      { id: "e0000003-0000-0000-0000-000000000001", text: "The professor uses active-learning exercises in balance with a teacher-led presentation appropriate to the lesson." },
      { id: "e0000003-0000-0000-0000-000000000002", text: "Before sending students to active learning tasks (group work, paired discussions, polling, team problem-solving, in-class writing), the professor provides explicit modeling and clear instructions (eg rationale, duration, product)." },
      { id: "e0000003-0000-0000-0000-000000000003", text: "Instructor creates opportunities for interaction between students (breakout rooms, use of chat, collaborative google docs)." },
      { id: "e0000003-0000-0000-0000-000000000004", text: "It is evident that professor is present, proactive, and engaged (if webcam on, is clearly visible and facing camera, keeps an eye on chat or Q&A, monitors waiting room, turns on/off mute as needed, minimal distractions)." },
    ],
  },
  {
    name: "Learning Materials",
    displayOrder: 4,
    statements: [
      { id: "e0000004-0000-0000-0000-000000000001", text: "The professor prepared and uses technology appropriate for the lesson, and gathers needed links and presentations before the start of class." },
      { id: "e0000004-0000-0000-0000-000000000002", text: "The professor provides relevant instructional materials with clear instructions." },
      { id: "e0000004-0000-0000-0000-000000000003", text: "The materials are made available to help students who cannot attend online classes or have technical difficulties." },
      { id: "e0000004-0000-0000-0000-000000000004", text: "The professor presents course material in a clear manner that facilitates understanding." },
    ],
  },
  {
    name: "Time Management",
    displayOrder: 5,
    statements: [
      { id: "e0000005-0000-0000-0000-000000000001", text: "The professor starts and ends the class session on time." },
      { id: "e0000005-0000-0000-0000-000000000002", text: "He/she allows time for questions, discussion and/or summarizing the session's lesson." },
      { id: "e0000005-0000-0000-0000-000000000003", text: "He/she maximizes in-class time, using active learning or applications." },
      { id: "e0000005-0000-0000-0000-000000000004", text: "He/she clearly indicates time limits for all student activities, using a time-based agenda, or visual and auditory prompts." },
    ],
  },
  {
    name: "Experiential Learning Provided to Students",
    displayOrder: 6,
    statements: [
      { id: "e0000006-0000-0000-0000-000000000001", text: "The professor utilizes appropriate tools and materials to motivate learners (e.g. interactive or competitive games, music, video, etc)." },
      { id: "e0000006-0000-0000-0000-000000000002", text: "He/she builds in-pauses in the lesson to provide opportunities for students to ask questions and promptly responds to questions." },
      { id: "e0000006-0000-0000-0000-000000000003", text: "He/she arouses students' interest with relevant life-learning skills (relatable stories)." },
      { id: "e0000006-0000-0000-0000-000000000004", text: "He/she provides opportunities for students to take responsibility." },
    ],
  },
  {
    name: "Respect the Uniqueness of the Students",
    displayOrder: 7,
    statements: [
      { id: "e0000007-0000-0000-0000-000000000001", text: "The professor shows consideration and provides opportunities to students." },
      { id: "e0000007-0000-0000-0000-000000000002", text: "He/she draws non-participating students into activities/discussions and prevents specific students from dominating/monopolizing activities/discussions." },
      { id: "e0000007-0000-0000-0000-000000000003", text: "Addresses potentially disruptive behaviours before they impact learning environment." },
    ],
  },
  {
    name: "Assessment and Feedback",
    displayOrder: 8,
    statements: [
      { id: "e0000008-0000-0000-0000-000000000001", text: "The professor provides class generalized constructive and encouraging feedback on how to improve their comprehension or performance in class." },
      { id: "e0000008-0000-0000-0000-000000000002", text: "He/she attends respectfully to student's comprehension or confusion." },
      { id: "e0000008-0000-0000-0000-000000000003", text: "He/she shows evidence of reinforcement (such as token or certificate, positive points) appropriate to remote or online contexts." },
      { id: "e0000008-0000-0000-0000-000000000004", text: "His/her assessments are suitable for distance learning environment (different tools, roleplay, written activity and others)." },
      { id: "e0000008-0000-0000-0000-000000000005", text: "He/she assesses students both informally and formally within the online or remote classroom through use of games, quizzes, online tests, etc." },
      { id: "e0000008-0000-0000-0000-000000000006", text: "He/she provides immediate feedback." },
    ],
  },
]
