// Re-exports the service-role pool from @camello/db.
// All internal/ops route imports must go through this file — never import
// servicePool directly from @camello/db in handler code.
export { servicePool } from '@camello/db';
