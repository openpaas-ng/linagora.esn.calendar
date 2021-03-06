/**
  * @swagger
  * parameter:
  *   calendar_user_id:
  *     name: userId
  *     in: query
  *     description: ID of user
  *     required: true
  *     type: string
  *   calendar_collabortion_object_type:
  *     name: objectType
  *     in: path
  *     description: The type of collaboration (community, project)
  *     required: true
  *     type: string
  *     enum:
  *       - community
  *       - project
  *   calendar_collaboration_id:
  *     name: collaboration
  *     in: query
  *     description: ID of collaboration
  *     required: true
  *     type: string
  *   calendar_calendar_id:
  *     name: calendarId
  *     in: path
  *     description: The calendar id (must match with a collaboration object)
  *     required: true
  *     type: string
  *   calendar_calendar_event:
  *     name: request_body
  *     in: body
  *     description: Detail of event.
  *     required: true
  *     schema:
  *       $ref: "#/definitions/calendar_calendar_event"
  *   calendar_invite:
  *     name: invite
  *     in: body
  *     description: request body of invited attendee
  *     required: true
  *     schema:
  *       $ref: "#/definitions/calendar_invite"
  *   calendar_sort_key:
  *     name: sortKey
  *     in: query
  *     description: a way to arrange data based by key
  *     required: true
  *     type: string
  *   calendar_sort_order:
  *     name: sortOrder
  *     in: query
  *     description: A way to arrange data based on value or data type.
  *     required: true
  *     type: string
  *   calendar_user_uid:
  *     name: uid
  *     in: query
  *     description: event uid of user
  *     required: true
  *     type: string
  *   calendar_user_attendee_email:
  *     name: attendeeEmail
  *     in: query
  *     description: attendee email of user
  *     required: true
  *     type: string
  *   calendar_user_action:
  *     name: action
  *     in: query
  *     description: action of user.
  *     required: true
  *     type: string
  *   calendar_user_organizer_email:
  *     name: organizerEmail
  *     in: query
  *     description: organizer email of user
  *     required: true
  *     type: string
  *   calendar_user_calendar_URI:
  *     name: calendarURI
  *     in: query
  *     description: calendar URI of user.
  *     required: true
  *     type: string
  *   calendar_token:
  *     name: token
  *     in: query
  *     description: a token of calendar.
  *     required: true
  *     type: string
  */
