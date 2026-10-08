import {canonicalHeaderSql} from './report-headers.ts';
/** Immutable source revisions; latest known non-null fields form the published view.
 * Only the same source/day/store and revisions no newer than the published revision participate.
 * Zero is a valid replacement. No value is inferred or copied from another report date.
 */
export const revisionProjection=`LEFT JOIN LATERAL (
 SELECT jsonb_object_agg(fields.key,fields.value) AS values
 FROM (
  SELECT DISTINCT ON (mapped.key) mapped.key,e.value
  FROM public.performance_report_revisions pv
  JOIN public.performance_report_rows pr ON pr.revision_id=pv.revision_id
  CROSS JOIN LATERAL jsonb_each(pr.source_values) e
  CROSS JOIN LATERAL (SELECT ${canonicalHeaderSql} AS key) mapped
  WHERE pv.source_key=c.source_key AND pv.report_date=c.report_date AND pr.store_id=r.store_id
    AND pr.present=true AND (pv.requested_at<c.requested_at OR (pv.requested_at=c.requested_at AND pv.revision_id<=c.revision_id)) AND e.value<>'null'::jsonb
  ORDER BY mapped.key,pv.requested_at DESC,pv.received_at DESC,pv.revision_id DESC
 ) fields
) resolved ON true`;
