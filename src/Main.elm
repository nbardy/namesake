module Main exposing (Msg)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (onMouseDown)
import Math.Vector2 exposing (vec2, direction, scale, toTuple)


-- import Time exposing (..)

import Collage
import Text exposing (link, fromString)
import Element
import Color exposing (Color)
import Mouse
import Platform.Cmd as Cmd
import Platform.Sub as Sub


-- import Debug exposing (log)

import Time exposing (Time)
import Window
import Task
import AnimationFrame exposing (..)
import DrawingUtilities exposing (gridPoints, colorFromRainbow, fillBackground)
import Types exposing (..)


-- User moduels

import Stars exposing (renderStars)
import Perspective exposing (renderPerspective)


main : Program Never Model Msg
main =
    program
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


init : ( Model, Cmd Msg )
init =
    ( { mouse = ( 0, 0 )
      , windowSize = { width = 0, height = 0 }
      , config = { padding = 50, size = 5 }
      , background = Perspective
      , t = 0
      , popup = False
      }
    , Task.perform WindowResize Window.size
    )



-- UPDATE


type Msg
    = Frame Time
    | MousePos Pos
    | WindowResize Window.Size
    | BackgroundChange Background
    | PopupToggle


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        MousePos ( x, y ) ->
            let
                xshift =
                    round ((toFloat model.windowSize.width) / 2)

                yshift =
                    round ((toFloat model.windowSize.height) / 2)
            in
                ( { model | mouse = ( (x - xshift), (yshift - y) ) }
                , Cmd.none
                )

        Frame t ->
            ( { model | t = t }, Cmd.none )

        WindowResize size ->
            ( { model | windowSize = size }, Cmd.none )

        BackgroundChange background ->
            ( { model | background = background }, Cmd.none )

        PopupToggle ->
            ( { model | popup = not model.popup }, Cmd.none )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ Mouse.moves (\{ x, y } -> MousePos ( x, y ))
        , AnimationFrame.times Frame
        , Window.resizes WindowResize
        ]


distance : Pos -> Pos -> Float
distance ( x0, y0 ) ( x1, y1 ) =
    ((x0 - x1) ^ 2 + (y0 - y1) ^ 2) |> toFloat |> sqrt


mouseRowFloat : Pos -> Float
mouseRowFloat mouse =
    toFloat (Tuple.first mouse)


mouseColFloat : Pos -> Float
mouseColFloat mouse =
    toFloat (Tuple.second mouse)


intTupleToVec : Pos -> Math.Vector2.Vec2
intTupleToVec ( x, y ) =
    (vec2 (toFloat x) (toFloat y))


directionalVector : Pos -> Pos -> Math.Vector2.Vec2
directionalVector v0 v1 =
    direction (intTupleToVec v0) (intTupleToVec v1)


ngon : Model -> Collage.Form
ngon model =
    (Collage.ngon 6 350)
        |> Collage.filled (Color.rgb 20 20 20)


renderSpinners : Model -> Collage.Form
renderSpinners model =
    let
        spinningRects =
            gridPoints model.config.padding model.windowSize
                |> List.map (renderSpinner model)
                |> Collage.group

        color =
            (colorFromRainbow 0.001 (2000 + (mouseRowFloat model.mouse)))

        background =
            fillBackground model.windowSize color
    in
        [ background, spinningRects ] |> Collage.group


renderSpinner : Model -> Pos -> Collage.Form
renderSpinner { config, windowSize, mouse, t } ( row, col ) =
    let
        color =
            (colorFromRainbow 0.004 (mouseColFloat mouse))

        size =
            (mouseRowFloat mouse)
                |> (*) 0.01
                |> (-) 9
                |> (-) (toFloat config.padding)
    in
        Collage.square size
            |> Collage.filled color
            |> Collage.move ( toFloat row, toFloat col )
            |> Collage.rotate (degrees (t / 40))


renderEye : Model -> Pos -> Collage.Form
renderEye { config, windowSize, mouse } ( row, col ) =
    let
        padding =
            toFloat config.padding

        vectorTowardsMouse =
            directionalVector mouse ( row, col )
    in
        [ Collage.circle (padding / 2)
            |> Collage.filled (Color.rgb 123 123 20)
            |> Collage.move
                ( (toFloat row) * padding
                , (toFloat col) * padding
                )
        , Collage.circle 12
            |> Collage.filled (Color.rgb 255 255 255)
            |> Collage.move ( toFloat row, toFloat col )
            |> Collage.move (toTuple (scale 5 vectorTowardsMouse))
        ]
            |> Collage.group


rainbowDot : Model -> Pos -> Collage.Form
rainbowDot { config, windowSize, mouse } ( row, col ) =
    let
        cols =
            windowSize.height // config.padding

        ( mouseRow, mouseCol ) =
            mouse

        mouseN =
            mouseRow * cols + mouseCol

        dist =
            (distance ( row, col ) mouse) / 10

        speed =
            92 / toFloat (windowSize.height)

        -- round (((sin (toFloat (n + 6) / 10)) * 122.5) + 122.5)
    in
        Collage.square (toFloat config.padding)
            --((350 - (d / 2)) ^ 0.52)
            |> Collage.filled (colorFromRainbow speed dist)
            |> Collage.move ( toFloat row, toFloat col )


name : Collage.Form
name =
    let
        default =
            Text.defaultStyle
    in
        Text.fromString "Nicholas Bardy"
            |> Text.style
                { default
                    | height = Just 72
                    , bold = False
                    , typeface = [ "Permanent Marker" ]
                    , color = (Color.rgb 255 255 255)
                }
            |> Collage.text


background : Model -> Collage.Form
background model =
    case model.background of
        Rainbow ->
            gridPoints model.config.padding model.windowSize
                |> List.map (rainbowDot model)
                |> Collage.group

        NGon ->
            ngon model

        Perspective ->
            renderPerspective model

        Spinners ->
            renderSpinners model

        Stars ->
            renderStars model


iconButton : String -> msg -> Html msg
iconButton icon msg =
    button
        [ class "icon-button"
        , style
            [ ( "border", "0" )
            , ( "outline", "0" )
            , ( "background", "white" )
            , ( "margin", "5px" )
            , ( "padding", "4px" )
            , ( "border-radius", "2px" )
            ]
        , onMouseDown msg
        ]
        [ img [ src icon ] []
        ]


view : Model -> Html Msg
view model =
    div []
        [ [ background model
          , name
          ]
            |> Collage.collage model.windowSize.width model.windowSize.height
            |> Element.toHtml
        , div [ id "background-buttons" ]
            [ iconButton "assets/pyramid.png" (BackgroundChange Perspective)
            , iconButton "assets/stars.png" (BackgroundChange Stars)
            , iconButton "assets/rainbow.png" (BackgroundChange Rainbow)
            , iconButton "assets/overlap.png" (BackgroundChange Spinners)
            , iconButton "assets/hexagon.png" (BackgroundChange NGon)
            ]
        , div [ id "info-button" ]
            [ iconButton "assets/question.png" PopupToggle ]
        , div
            [ id "info-popup"
            , class
                (if model.popup then
                    "open"
                 else
                    "close"
                )
            ]
            [ div [ id "popup-backdrop", onMouseDown PopupToggle ] []
            , div [ id "info-modal" ]
                [ p [] [ text "Hello, My name is Nicholas Bardy. I'm a surfer, eater, dreamer, sleeper, wanderer, and software developer by trade." ]
                , p []
                    [ text "I blog here: "
                    , a [ href "http://lambdafunk.com" ]
                        [ text "Lambda Funk" ]
                    ]
                , p []
                    [ text "I made "
                    , a [ href "https://play.google.com/store/apps/details?id=com.linguis.cards&hl=en" ]
                        [ text "this flashcard app" ]
                    , text " and "
                    , a [ href "http://nbardy.github.io/soundjam" ]
                        [ text "this music visualizer" ]
                    ]
                , p []
                    [ text "I wrote this with "
                    , a [ href "http://elmlang.org" ]
                        [ text "Elm" ]
                    , text " "
                    , text "and you can find the source "
                    , a [ href "http://github.com/nbardy" ]
                        [ text "here" ]
                    , text " on my "
                    , a [ href "http://github.com/nbardy/namesake" ]
                        [ text "GitHub" ]
                    ]
                ]
            ]
        ]
