module Perspective exposing (renderPerspective)

import Collage
import DrawingUtilities exposing (tween, colorFromRainbow, gridPoints, fillBackground, tween)
import Color exposing (Color)
import Types exposing (..)
import Debug exposing (log)


renderPerspective : Model -> Collage.Form
renderPerspective model =
    List.range 1 120
        |> List.map ((*) 23)
        |> List.map toFloat
        |> List.reverse
        |> List.map (renderSquare model)
        |> Collage.group


renderSquare : Model -> Float -> Collage.Form
renderSquare model size =
    let
        ( mouseRow, mouseCol ) =
            model.mouse

        color =
            (colorFromRainbow 0.009 size)

        rate =
            240

        powa =
            0.19

        row =
            tween ( toFloat mouseRow, 0 ) (((size / rate) ^ powa))

        col =
            tween ( toFloat mouseCol, 0 ) (((size / rate) ^ powa))
    in
        Collage.square size
            |> Collage.filled color
            |> Collage.move ( row, col )
