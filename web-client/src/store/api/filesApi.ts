import { baseApi } from './baseApi';

export const filesApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        prepareFile: builder.mutation({
            query: (data: { content_type: string; filename: string }) => ({
                url: '/files/prepare',
                method: 'POST',
                body: data,
            }),
        }),
        // The actual upload might be better handled outside RTK Query if it involves complex FormData/chunking,
        // but we can define a simple one for small files.
        uploadFileChunk: builder.mutation({
            query: (formData: FormData) => ({
                url: '/files/upload',
                method: 'POST',
                body: formData,
            }),
        }),
        uploadAvatar: builder.mutation({
            query: (file: File) => ({
                url: '/users/avatar',
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
            }),
        }),
    }),
});

export const { usePrepareFileMutation, useUploadFileChunkMutation, useUploadAvatarMutation } = filesApi;
