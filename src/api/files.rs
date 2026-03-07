use poem::{web::{Data, Multipart}, Result, error::InternalServerError, Body, Response};
use poem_openapi::{OpenApi, payload::Json, param::{Header, Path}, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use uuid::Uuid;
use sqlx::Row;
use std::path::{Path as FilePath, PathBuf};
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Default)]
pub struct FilesApi;

#[derive(Debug, std::clone::Clone, Object, Serialize, Deserialize)]
pub struct PrepareFileReq {
    pub content_type: String,
    pub filename: String,
}

#[derive(Debug, std::clone::Clone, Object, Serialize, Deserialize)]
pub struct PrepareFileRes {
    pub file_id: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct UploadCompleteRes {
    pub file_id: String,
    pub path: String,
}

#[OpenApi]
impl FilesApi {
    #[oai(path = "/files/prepare", method = "post")]
    async fn prepare_file(
        &self,
        req: Json<PrepareFileReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<PrepareFileRes>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let _user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let file_id = Uuid::new_v4().to_string();
        
        // Just return the file_id, we will create the file on first chunk
        Ok(Json(PrepareFileRes { file_id }))
    }

    #[oai(path = "/files/upload", method = "post")]
    async fn upload_file(
        &self,
        state: Data<&AppState>,
        mut req: Multipart,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<UploadCompleteRes>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let mut file_id = String::new();
        let mut chunk_data = Vec::new();
        let mut chunk_is_last = false;
        let mut filename = String::from("unnamed");
        let mut content_type = String::from("application/octet-stream");

        while let Ok(Some(field)) = req.next_field().await {
            let name = field.name().unwrap_or("").to_string();
            if name == "file_id" {
                file_id = field.text().await.unwrap_or_default();
            } else if name == "chunk_is_last" {
                chunk_is_last = field.text().await.unwrap_or_default() == "true";
            } else if name == "filename" {
                filename = field.text().await.unwrap_or_default();
            } else if name == "content_type" {
                content_type = field.text().await.unwrap_or_default();
            } else if name == "chunk_data" {
                chunk_data = field.bytes().await.unwrap_or_default();
            }
        }

        if file_id.is_empty() || chunk_data.is_empty() {
             return Err(poem::Error::from_string("Missing file_id or chunk_data", poem::http::StatusCode::BAD_REQUEST));
        }

        // Write to temp file
        let temp_dir = FilePath::new("data/tmp");
        tokio::fs::create_dir_all(temp_dir).await.map_err(InternalServerError)?;
        let temp_path = temp_dir.join(&file_id);

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&temp_path)
            .await
            .map_err(InternalServerError)?;

        file.write_all(&chunk_data).await.map_err(InternalServerError)?;

        if chunk_is_last {
            // Move from tmp to final storage
            let final_dir = FilePath::new("data/files");
            tokio::fs::create_dir_all(final_dir).await.map_err(InternalServerError)?;
            let final_path = final_dir.join(&file_id);
            tokio::fs::rename(&temp_path, &final_path).await.map_err(InternalServerError)?;

            // Get size
            let metadata = tokio::fs::metadata(&final_path).await.map_err(InternalServerError)?;
            let size = metadata.len() as i64;
            let hash = "TODO_SHA256".to_string(); // Mock for MVP
             
            // Save to DB
            sqlx::query(
                "INSERT INTO files (id, uploader_id, filename, content_type, path, size, hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&file_id)
            .bind(&user_id)
            .bind(&filename)
            .bind(&content_type)
            .bind(final_path.to_string_lossy().to_string())
            .bind(size)
            .bind(&hash)
            .execute(&state.sql_pool)
            .await
            .map_err(InternalServerError)?;

            return Ok(Json(UploadCompleteRes {
                file_id: file_id.clone(),
                path: format!("/api/files/{}", file_id),
            }));
        }

        Ok(Json(UploadCompleteRes { file_id, path: "".to_string() }))
    }

}

#[poem::handler]
pub async fn download_file(
    state: Data<&AppState>,
    id: poem::web::Path<String>,
) -> Result<Response> {
    let row = sqlx::query("SELECT path, content_type, filename FROM files WHERE id = ?")
        .bind(&id.0)
        .fetch_optional(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

    if let Some(row) = row {
        let path: String = row.get("path");
        let content_type: String = row.get("content_type");
        let _filename: String = row.get("filename");

        let file = File::open(path).await.map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::NOT_FOUND))?;
        
        let res = Response::builder()
            .header(poem::http::header::CONTENT_TYPE, content_type)
            .body(Body::from_async_read(file));
            
        Ok(res)
    } else {
         Err(poem::Error::from_string("File not found", poem::http::StatusCode::NOT_FOUND))
    }
}
