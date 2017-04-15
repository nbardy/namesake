module Triangles exposing (renderTriangles)

-- Libraries

import Random
import Collage
import DrawingUtilities exposing (tween, gridPoints, fillBackground)
import Color exposing (Color)


-- User Modules

import Types exposing (..)


drawTriangle : List ( Float, Float ) -> Collage.Form
drawTriangle points =
    Collage.polygon points
        |> Collage.filled (Color.rgb 0 0 0)


nearestTriangles : a -> List (List ( number, number1 ))
nearestTriangles a =
    [ [ ( 0, 100 ), ( 100, 100 ), ( 100, 0 ) ] ]


type alias MovingPoint =
    { x : Float
    , y : Float
    , xtravel : ( Float, Float )
    , ytravel : ( Float, Float )
    }


randomMovingPoint : Model -> Pos -> Random.Generator MovingPoint
randomMovingPoint model ( row, col ) =
    let
        padding =
            toFloat model.config.padding

        rowFloat =
            toFloat row

        colFloat =
            toFloat col
    in
        Random.map4 MovingPoint
            (Random.float rowFloat (rowFloat + padding))
            (Random.float colFloat (colFloat + padding))
            (Random.pair
                (Random.float (-2 * padding) (2 * padding))
                (Random.float (-2 * padding) (2 * padding))
            )
            (Random.pair
                (Random.float (-2 * padding) (2 * padding))
                (Random.float (-2 * padding) (2 * padding))
            )


generateRandomPoint : Model -> Pos -> ( Float, Float )
generateRandomPoint model ( row, col ) =
    let
        ( point, _ ) =
            Random.step (randomMovingPoint model ( row, col ))
                (Random.initialSeed (row * 7913 + col))

        t =
            model.t / 2000

        x =
            point.x
                + tween point.xtravel (0.5 + (sin t) / 2)

        y =
            point.y
                + tween point.ytravel (0.5 + (sin t) / 2)
    in
        ( x, y )


renderTriangles : Model -> Collage.Form
renderTriangles model =
    gridPoints model.config.padding model.windowSize
        |> List.map (generateRandomPoint model)
        |> nearestTriangles
        |> List.map drawTriangle
        |> Collage.group
