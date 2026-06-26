// ============================================================================
// GemmaBridge — Domain Types
// Central type definitions for the entire application.
// ============================================================================

/** A single PECS card option within a board. */
export interface PECSCard {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly colorClass: string;
  readonly category?: PECSCategory;
}

/** A complete PECS board containing multiple card options. */
export interface PECSBoard {
  readonly id: string;
  readonly title: string;
  readonly cards: readonly PECSCard[];
  readonly prompt: string;
  readonly createdAt: string;
  readonly studentId?: string;
}

/** A student profile with behavioral and sensory preferences. */
export interface StudentProfile {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly avatarColor: string;
  readonly needs: readonly string[];
  readonly sensoryPreferences: SensoryPreferences;
  readonly notes: string;
  readonly createdAt: string;
}

/** Sensory preference configuration for a student. */
export interface SensoryPreferences {
  readonly soundSensitivity: SensitivityLevel;
  readonly lightSensitivity: SensitivityLevel;
  readonly touchSensitivity: SensitivityLevel;
  readonly preferredCalmingStrategies: readonly string[];
}

/** A lesson adaptation suggestion from the AI engine. */
export interface LessonAdaptation {
  readonly title: string;
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly icon: string;
}

/** A saved lesson adaptation. */
export interface SavedLesson {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly adaptations: readonly LessonAdaptation[];
  readonly createdAt: string;
  readonly studentId?: string;
}

/** A logged interaction session in Student Mode. */
export interface SessionLog {
  readonly id: string;
  readonly boardId: string;
  readonly boardTitle: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly selectedCardId: string;
  readonly selectedCardTitle: string;
  readonly timestamp: string;
  readonly roundNumber?: number;
  readonly totalRounds?: number;
}

/** Categories for PECS cards. */
export type PECSCategory =
  | 'self-regulation'
  | 'food'
  | 'academic'
  | 'social'
  | 'emotions'
  | 'daily-routine'
  | 'transition'
  | 'request';

/** Sensitivity levels for sensory preferences. */
export type SensitivityLevel = 'low' | 'moderate' | 'high';

/** Lesson subjects supported by the adaptor. */
export type LessonSubject = 'reading' | 'math' | 'science' | 'art' | 'physical-education';

// ============================================================================
// API Contract Types
// ============================================================================

/** Request body for the PECS generation API. */
export interface GeneratePECSRequest {
  readonly prompt: string;
  readonly studentId?: string;
}

/** Response body from the PECS generation API. */
export interface GeneratePECSResponse {
  readonly success: boolean;
  readonly board?: PECSBoard;
  readonly error?: string;
}

/** Request body for the lesson adaptation API. */
export interface GenerateLessonRequest {
  readonly prompt: string;
  readonly subject?: LessonSubject;
}

/** Response body from the lesson adaptation API. */
export interface GenerateLessonResponse {
  readonly success: boolean;
  readonly adaptations?: readonly LessonAdaptation[];
  readonly lessonTitle?: string;
  readonly error?: string;
}
