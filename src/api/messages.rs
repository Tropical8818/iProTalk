use poem::{web::Data, Result};
use poem_openapi::{OpenApi, payload::{Json}, param::{Path, Header}, ApiResponse};
use crate::{db::AppState, models::{MessagePayload, MessageEvent}};
use futures_util::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use uuid::Uuid;
use poem::web::sse::Event;

#[derive(Clone, Default)]
pub struct MessagesApi;

#[OpenApi]
impl MessagesApi {
    #[oai(path = "/messages/group/:gid", method = "post")]
    async fn send_group_message(
        &self,
        state: Data<&AppState>,
        _gid: Path<String>,
        req: Json<MessagePayload>,
        #[oai(name = "Authorization")] auth_header: Header<Option<String>>,
    ) -> Result<Json<String>> {
         // Verify Auth (Mock)
        let _token = auth_header.0.ok_or(poem::Error::from_string("Missing Auth Token", poem::http::StatusCode::FORBIDDEN))?;
        
        // Store in Sled
        // Key: msg:<uuid>
        // Value: JSON(MessagePayload)
        let msg_id = Uuid::new_v4().to_string();
        let key = format!("msg:{}", msg_id);
        let value = serde_json::to_vec(&req.0).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;
        
        state.msg_db.insert(key, value).map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        // Broadcast Event
        let event = MessageEvent {
            event_type: "new_message".to_string(),
            payload: req.0.clone(),
            timestamp: chrono::Utc::now().timestamp(),
        };

        // Ignore error if no active subscribers
        let _ = state.sender.send(event);

        Ok(Json(msg_id))
    }

}

#[poem::handler]
pub async fn sse_handler(
    state: Data<&AppState>,
) -> poem::web::sse::SSE {
    let mut rx = state.sender.subscribe();
    
    // Convert BroadcastStream to SSE Stream
    let stream = BroadcastStream::new(rx).map(|msg| {
            match msg {
                Ok(event) => {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    Event::message(json)
                }
                Err(_) => Event::message("{\"error\": \"lagged\"}")
            }
    });

    poem::web::sse::SSE::new(stream).keep_alive(std::time::Duration::from_secs(10))
}
