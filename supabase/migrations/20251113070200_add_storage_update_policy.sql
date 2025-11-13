-- Add UPDATE policy for storage.objects to allow users to rename their own documents
-- This policy is required for the storage.move() operation to work

CREATE POLICY "Users can update own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))
WITH CHECK ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
