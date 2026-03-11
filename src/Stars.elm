module Stars exposing (renderStars)

-- Libraries

import Random
import Random.Extra
import Collage
import DrawingUtilities exposing (gridPoints, fillBackground, tween)
import Color exposing (Color)


-- User Modules

import Types exposing (..)


type alias Star =
    { radius : Float
    , pos : ( Float, Float )
    , brightness : ( Float, Float )
    , timeOffset : Float
    , cycleDuration : Float
    , color : Color.Color
    }


randomStarColor =
    [ (Color.rgb 155 176 255)
    , (Color.rgb 170 191 255)
    , (Color.rgb 202 215 255)
    , (Color.rgb 248 247 255)
    , (Color.rgb 255 244 234)
    , (Color.rgb 255 210 161)
    , (Color.rgb 255 204 111)
    ]
        |> List.map Random.Extra.constant
        |> Random.Extra.choices


randomStar : Model -> Pos -> Random.Generator Star
randomStar model ( row, col ) =
    let
        padding =
            model.config.padding
    in
        Random.Extra.map6 Star
            (Random.float 0 1)
            (Random.pair (Random.float (toFloat row) (toFloat (row + padding)))
                (Random.float (toFloat col) (toFloat (col + padding)))
            )
            (Random.pair (Random.float 0 0.4) (Random.float 0.4 1))
            (Random.float 0 1000)
            (Random.float 500 2400)
            randomStarColor


-- FBM noise for organic star density distribution.
-- hash2d: fract(sin(dot(p, (127.1, 311.7))) * 43758.5453)
hash2d : Float -> Float -> Float
hash2d x y =
    let
        d = x * 127.1 + y * 311.7
        s = sin d * 43758.5453
    in
        s - toFloat (floor s)


-- Value noise with smoothstep interpolation
valueNoise : Float -> Float -> Float
valueNoise x y =
    let
        ix = floor x
        iy = floor y
        fx = x - toFloat ix
        fy = y - toFloat iy
        sx = fx * fx * (3 - 2 * fx)
        sy = fy * fy * (3 - 2 * fy)
        n00 = hash2d (toFloat ix) (toFloat iy)
        n10 = hash2d (toFloat (ix + 1)) (toFloat iy)
        n01 = hash2d (toFloat ix) (toFloat (iy + 1))
        n11 = hash2d (toFloat (ix + 1)) (toFloat (iy + 1))
        nx0 = n00 + sx * (n10 - n00)
        nx1 = n01 + sx * (n11 - n01)
    in
        nx0 + sy * (nx1 - nx0)


-- 4-octave FBM with irrational frequency ratios to avoid grid harmonics
fbm : Float -> Float -> Float
fbm x y =
    valueNoise x y * 0.5
    + valueNoise (x * 2.03 + 1.7) (y * 2.03 + 9.2) * 0.25
    + valueNoise (x * 4.07 + 5.3) (y * 4.07 + 2.8) * 0.125
    + valueNoise (x * 8.17 + 8.1) (y * 8.17 + 4.7) * 0.0625


generateStars : Model -> Pos -> List Star
generateStars model ( row, col ) =
    let
        -- FBM density at this grid cell position
        -- Scale grid coords into noise space for large-scale variation
        nx = toFloat row / 150.0
        ny = toFloat col / 150.0
        density = fbm (nx * 3.0 + 13.7) (ny * 3.0 + 7.3)

        -- density range is ~0 to ~0.9; map to star count
        -- below 0.2 = void (0 stars), above 0.7 = dense (6 stars)
        starCount =
            if density < 0.2 then
                0
            else
                clamp 1 6 (round ((density - 0.2) * 12))

        ( _, seed ) =
            Random.step (Random.int 0 0)
                (Random.initialSeed (row * 7913 + col))

        ( stars, _ ) =
            Random.step (Random.list starCount (randomStar model ( row, col )))
                seed
    in
        stars


renderStar : Model -> Star -> Collage.Form
renderStar model star =
    let
        rate =
            1000

        t =
            ((model.t + star.timeOffset) / star.cycleDuration)

        brightness =
            tween star.brightness (0.5 + (sin t) / 2)
    in
        Collage.circle star.radius
            |> Collage.filled star.color
            |> Collage.alpha brightness
            |> Collage.move star.pos


renderStars : Model -> Collage.Form
renderStars model =
    gridPoints model.config.padding model.windowSize
        |> List.concatMap (generateStars model)
        |> List.map (renderStar model)
        |> (++) [ fillBackground model.windowSize (Color.rgb 0 0 0) ]
        |> Collage.group
