/**
 * Type definitions for import.meta.glob functionality
 * This extends the ImportMeta interface to include the glob method
 * that is transformed by our bunGlobPlugin
 */

interface ImportMeta {
  /**
   * Dynamically import modules using glob patterns
   * This will be transformed by bunGlobPlugin into an object
   * where keys are file paths and values are dynamic import functions
   */
  glob<T = any>(pattern: string): Record<string, () => Promise<T>>
}
