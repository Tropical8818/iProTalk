use poem::{web::Data, Result, error::InternalServerError};
use poem_openapi::{OpenApi, payload::Json, param::Header, Object};
use serde::{Deserialize, Serialize};
use crate::{db::AppState, api::utils::decode_user_id_from_token};
use uuid::Uuid;
use sqlx::Row;

#[derive(Clone, Default)]
pub struct ContactsApi;

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ContactActionReq {
    pub action: String, // "add" | "block" | "remove"
    pub target_uid: String,
}

#[derive(Debug, Object, Serialize, Deserialize)]
pub struct ContactResponse {
    pub id: String,
    pub target_uid: String,
    pub status: String,
}

#[OpenApi]
impl ContactsApi {
    #[oai(path = "/contacts", method = "get")]
    async fn get_contacts(
        &self,
        state: Data<&AppState>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<Vec<ContactResponse>>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let rows = sqlx::query(
            "SELECT id, addressee_id, status FROM contacts WHERE requester_id = ?"
        )
        .bind(&user_id)
        .fetch_all(&state.sql_pool)
        .await
        .map_err(InternalServerError)?;

        let mut contacts = Vec::new();
        for row in rows {
            contacts.push(ContactResponse {
                id: row.get("id"),
                target_uid: row.get("addressee_id"),
                status: row.get("status"),
            });
        }

        Ok(Json(contacts))
    }

    #[oai(path = "/contacts/update", method = "post")]
    async fn update_contact_status(
        &self,
        state: Data<&AppState>,
        req: Json<ContactActionReq>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
        let token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        let user_id = decode_user_id_from_token(&token)
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::FORBIDDEN))?;

        let target_uid = &req.0.target_uid;
        let action = &req.0.action;

        if action == "remove" {
            sqlx::query("DELETE FROM contacts WHERE requester_id = ? AND addressee_id = ?")
                .bind(&user_id)
                .bind(target_uid)
                .execute(&state.sql_pool)
                .await
                .map_err(InternalServerError)?;
        } else {
            let status = match action.as_str() {
                "add" => "added",
                "block" => "blocked",
                _ => return Err(poem::Error::from_string("Invalid action", poem::http::StatusCode::BAD_REQUEST)),
            };

            let cid = Uuid::new_v4().to_string();

            // Check if exists
            let exists = sqlx::query("SELECT id FROM contacts WHERE requester_id = ? AND addressee_id = ?")
                .bind(&user_id)
                .bind(&target_uid)
                .fetch_optional(&state.sql_pool)
                .await
                .map_err(InternalServerError)?;

            if exists.is_some() {
                sqlx::query("UPDATE contacts SET status = ? WHERE requester_id = ? AND addressee_id = ?")
                    .bind(status)
                    .bind(&user_id)
                    .bind(&target_uid)
                    .execute(&state.sql_pool)
                    .await
                    .map_err(InternalServerError)?;
            } else {
                sqlx::query("INSERT INTO contacts (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)")
                    .bind(&cid)
                    .bind(&user_id)
                    .bind(&target_uid)
                    .bind(status)
                    .execute(&state.sql_pool)
                    .await
                    .map_err(InternalServerError)?;
            }
        }

        Ok(Json("Success".to_string()))
    }
}
